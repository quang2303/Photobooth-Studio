using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Reflection;
using System.Runtime.InteropServices;
using CameraControl.Devices;
using CameraControl.Devices.Classes;
using CameraControl.Devices.Canon;
using Canon.Eos.Framework;
using Canon.Eos.Framework.Internal.SDK;

namespace CanonBridge
{
    class Program
    {
        private const int Port = 5514;
        private static CameraDeviceManager _manager;
        private static HttpListener _listener;
        private static bool _isRunning = true;
        
        private static bool _isLiveViewRunning = false;
        private static Thread _liveViewThread = null;
        private static byte[] _latestFrame = null;
        private static readonly object _frameLock = new object();
        
        private static AutoResetEvent _captureEvent = new AutoResetEvent(false);
        private static string _capturedFilePath = null;
        private static string _targetCapturePath = null;
        private static volatile bool _isCapturing = false;
        private static readonly object _captureLock = new object();
        private static readonly object _logLock = new object();

        [DllImport("EDSDK.dll")]
        public static extern uint EdsGetEvent();

        [DllImport("EDSDK.dll")]
        public static extern uint EdsSetPropertyData(IntPtr inRef, uint inPropertyID, int inParam, uint inSize, ref uint inPropertyData);

        [DllImport("EDSDK.dll")]
        public static extern uint EdsGetPropertyData(IntPtr inRef, uint inPropertyID, int inParam, uint inPropertySize, out uint outPropertyData);


        [StructLayout(LayoutKind.Sequential)]
        public struct MSG
        {
            public IntPtr hwnd;
            public uint message;
            public IntPtr wParam;
            public IntPtr lParam;
            public uint time;
            public int pt_x;
            public int pt_y;
        }

        [DllImport("user32.dll")]
        private static extern bool PeekMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax, uint wRemoveMsg);

        [DllImport("user32.dll")]
        private static extern bool TranslateMessage([In] ref MSG lpMsg);

        [DllImport("user32.dll")]
        private static extern IntPtr DispatchMessage([In] ref MSG lpMsg);

        public static void WriteLog(string msg)
        {
            string line = "[" + DateTime.Now.ToString("HH:mm:ss.fff") + "] " + msg;
            Console.WriteLine(line);
            try
            {
                lock (_logLock)
                {
                    string logFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "CanonBridge.log");
                    File.AppendAllText(logFile, line + "\r\n");
                }
            }
            catch { }
        }

        [STAThread]
        static void Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;
            WriteLog("[CanonBridge] Initializing Canon EDSDK Bridge on port " + Port + "...");

            // Hook internal SDK logs
            try
            {
                CameraControl.Devices.Log.LogDebug += (e) => WriteLog("[SDK-D] " + e.Message);
                CameraControl.Devices.Log.LogError += (e) => WriteLog("[SDK-E] " + e.Message + (e.Exception != null ? ": " + e.Exception.Message : ""));
                CameraControl.Devices.Log.LogInfo += (e) => WriteLog("[SDK-I] " + e.Message);
            }
            catch { }

            // Initialize Camera Manager
            try
            {
                _manager = new CameraDeviceManager();
                _manager.UseExperimentalDrivers = false;
                _manager.DisableNativeDrivers = false;
                _manager.DetectWebcams = false;
                _manager.LoadWiaDevices = false;
                _manager.PhotoCaptured += OnPhotoCaptured;
                _manager.CameraConnected += OnCameraConnected;
                _manager.CameraDisconnected += OnCameraDisconnected;

                WriteLog("[CanonBridge] Connecting to cameras...");
                EnsureCanonInitialized();
                _manager.ConnectToCamera();
            }
            catch (Exception ex)
            {
                WriteLog("[CanonBridge] Warning initializing manager: " + ex.Message);
            }

            // Start background thread for auto-detecting camera if disconnected
            Thread detectThread = new Thread(AutoDetectWorker);
            detectThread.IsBackground = true;
            detectThread.Start();

            // Start HTTP Server on a background worker thread
            StartHttpServer();

            // Run Windows message pump on Main STA thread for EDSDK events
            RunEventLoop();

            // Clean up on exit
            Cleanup();
        }

        private static void RunEventLoop()
        {
            WriteLog("[CanonBridge] Main thread EDSDK message pump active.");
            MSG msg;
            while (_isRunning)
            {
                try
                {
                    EdsGetEvent();
                    while (PeekMessage(out msg, IntPtr.Zero, 0, 0, 1))
                    {
                        TranslateMessage(ref msg);
                        DispatchMessage(ref msg);
                    }
                }
                catch { }
                Thread.Sleep(10);
            }
            WriteLog("[CanonBridge] Main thread EDSDK message pump stopped.");
        }

        private static void OnCameraConnected(ICameraDevice cameraDevice)
        {
            WriteLog("[CanonBridge] Camera Connected: " + cameraDevice.DeviceName + " (" + cameraDevice.Manufacturer + ")");
            if (_manager != null)
            {
                _manager.SelectedCameraDevice = cameraDevice;
            }
            try
            {
                cameraDevice.PhotoCaptured -= OnPhotoCaptured;
                cameraDevice.PhotoCaptured += OnPhotoCaptured;
                cameraDevice.CaptureInSdRam = true;
            }
            catch { }

        }

        private static void OnCameraDisconnected(ICameraDevice cameraDevice)
        {
            WriteLog("[CanonBridge] Camera Disconnected: " + (cameraDevice != null ? cameraDevice.DeviceName : "Unknown"));
            StopLiveViewInternal();
            if (_manager != null && _manager.SelectedCameraDevice == cameraDevice)
            {
                _manager.SelectedCameraDevice = null;
            }
        }

        private static void OnPhotoCaptured(object sender, PhotoCapturedEventArgs eventArgs)
        {
            WriteLog("[CanonBridge] PhotoCaptured event fired! File: " + eventArgs.FileName);
            if (!_isCapturing || (!string.IsNullOrEmpty(_capturedFilePath) && File.Exists(_capturedFilePath)))
            {
                _captureEvent.Set();
                return;
            }

            // If shooting RAW+JPG, skip the RAW CR3/CR2/DNG file so we download the JPEG
            if (!string.IsNullOrEmpty(eventArgs.FileName) &&
                (eventArgs.FileName.EndsWith(".CR3", StringComparison.OrdinalIgnoreCase) ||
                 eventArgs.FileName.EndsWith(".CR2", StringComparison.OrdinalIgnoreCase) ||
                 eventArgs.FileName.EndsWith(".DNG", StringComparison.OrdinalIgnoreCase)))
            {
                WriteLog("[CanonBridge] Skipping RAW file (" + eventArgs.FileName + "), waiting for JPEG...");
                return; // DO NOT set _captureEvent, keep waiting for the JPEG!
            }

            try
            {
                string target = _targetCapturePath;
                if (string.IsNullOrEmpty(target))
                {
                    string tempDir = Path.Combine(Path.GetTempPath(), "camera-sync-agent");
                    if (!Directory.Exists(tempDir)) Directory.CreateDirectory(tempDir);
                    target = Path.Combine(tempDir, "canon_capture_" + DateTime.Now.Ticks + ".jpg");
                }

                // Ensure target directory exists
                string dir = Path.GetDirectoryName(target);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                WriteLog("[CanonBridge] Transferring photo to: " + target);
                if (eventArgs.CameraDevice != null)
                {
                    eventArgs.CameraDevice.TransferFile(eventArgs.Handle, target);
                }
                else
                {
                    eventArgs.Transfer(target);
                }

                // Validate that the transferred file is a real JPEG (SOI marker FF D8 FF)
                if (File.Exists(target) && new FileInfo(target).Length > 1000)
                {
                    byte[] header = new byte[3];
                    using (FileStream fs = File.OpenRead(target))
                    {
                        fs.Read(header, 0, 3);
                    }
                    if (header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF)
                    {
                        _capturedFilePath = target;
                        WriteLog("[CanonBridge] Valid JPEG transferred successfully: " + target + " (" + new FileInfo(target).Length + " bytes)");
                        _captureEvent.Set();
                    }
                    else
                    {
                        WriteLog("[CanonBridge] Transferred file header is not JPEG (0x" + header[0].ToString("X2") + header[1].ToString("X2") + "). Waiting for JPEG...");
                    }
                }
                else
                {
                    WriteLog("[CanonBridge] Warning: Transferred file is missing or empty.");
                }
            }
            catch (Exception ex)
            {
                WriteLog("[CanonBridge] Error transferring photo: " + ex.Message);
            }
        }

        private static void EnsureCanonInitialized()
        {
            if (_manager == null) return;
            try
            {
                var field = typeof(CameraDeviceManager).GetField("_framework", BindingFlags.NonPublic | BindingFlags.Instance);
                if (field != null && field.GetValue(_manager) == null)
                {
                    WriteLog("[CanonBridge] Initializing Canon EDSDK engine...");
                    var initMethod = typeof(CameraDeviceManager).GetMethod("InitCanon", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
                    if (initMethod != null)
                    {
                        initMethod.Invoke(_manager, null);
                    }
                }

                if (_manager.SelectedCameraDevice == null || !_manager.SelectedCameraDevice.IsConnected)
                {
                    var addMethod = typeof(CameraDeviceManager).GetMethod("AddCanonCameras", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
                    if (addMethod != null)
                    {
                        addMethod.Invoke(_manager, null);
                    }
                }

                if (_manager.SelectedCameraDevice != null)
                {
                    try
                    {
                        _manager.SelectedCameraDevice.PhotoCaptured -= OnPhotoCaptured;
                        _manager.SelectedCameraDevice.PhotoCaptured += OnPhotoCaptured;
                        _manager.SelectedCameraDevice.CaptureInSdRam = true;
                    }
                    catch { }
                }
            }
            catch (Exception ex)
            {
                WriteLog("[CanonBridge] Canon initialization note: " + ex.Message);
            }
        }

        private static void AutoDetectWorker()
        {
            while (_isRunning)
            {
                try
                {
                    if (!_isCapturing && (_manager == null || _manager.SelectedCameraDevice == null || !_manager.SelectedCameraDevice.IsConnected))
                    {
                        if (_manager != null)
                        {
                            EnsureCanonInitialized();
                            _manager.ConnectToCamera();
                            // If SelectedCameraDevice is still null or not connected, pick the first connected device
                            if ((_manager.SelectedCameraDevice == null || !_manager.SelectedCameraDevice.IsConnected) && _manager.ConnectedDevices != null)
                            {
                                foreach (var dev in _manager.ConnectedDevices)
                                {
                                    if (dev != null && dev.IsConnected)
                                    {
                                        _manager.SelectedCameraDevice = dev;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                catch { }
                Thread.Sleep(3000);
            }
        }

        private static void LiveViewLoop()
        {
            WriteLog("[CanonBridge] Live View worker loop started.");
            while (_isLiveViewRunning && _isRunning)
            {
                ICameraDevice camera = _manager != null ? _manager.SelectedCameraDevice : null;
                if (camera == null || !camera.IsConnected)
                {
                    Thread.Sleep(200);
                    continue;
                }

                try
                {
                    LiveViewData lv = camera.GetLiveViewImage();
                    if (lv != null && lv.ImageData != null && lv.ImageData.Length > 0)
                    {
                        int pos = lv.ImageDataPosition;
                        int len = lv.ImageData.Length - pos;
                        if (pos >= 0 && len > 0)
                        {
                            byte[] frame = new byte[len];
                            Buffer.BlockCopy(lv.ImageData, pos, frame, 0, len);
                            lock (_frameLock)
                            {
                                _latestFrame = frame;
                            }
                        }
                    }
                }
                catch (Exception)
                {
                    // Rate limit error logs
                    Thread.Sleep(100);
                }

                Thread.Sleep(33); // ~30 FPS
            }
            WriteLog("[CanonBridge] Live View worker loop stopped.");
        }

        private static bool StartLiveViewInternal()
        {
            if (_isCapturing) return false;
            ICameraDevice camera = _manager != null ? _manager.SelectedCameraDevice : null;
            if (camera == null || !camera.IsConnected) return false;

            if (_isLiveViewRunning) return true;

            try
            {
                WriteLog("[CanonBridge] Starting Live View on camera: " + camera.DeviceName);
                camera.StartLiveView();
                _isLiveViewRunning = true;

                _liveViewThread = new Thread(LiveViewLoop);
                _liveViewThread.IsBackground = true;
                _liveViewThread.Start();
                return true;
            }
            catch (Exception ex)
            {
                WriteLog("[CanonBridge] Failed to start live view: " + ex.Message);
                _isLiveViewRunning = false;
                return false;
            }
        }

        private static void StopLiveViewInternal()
        {
            if (!_isLiveViewRunning) return;
            _isLiveViewRunning = false;

            if (_liveViewThread != null && _liveViewThread.IsAlive)
            {
                try { _liveViewThread.Join(500); } catch { }
                _liveViewThread = null;
            }

            ICameraDevice camera = _manager != null ? _manager.SelectedCameraDevice : null;
            if (camera != null)
            {
                try
                {
                    WriteLog("[CanonBridge] Stopping Live View on camera...");
                    camera.StopLiveView();
                }
                catch { }
            }

            lock (_frameLock)
            {
                _latestFrame = null;
            }
        }

        private static void StartHttpServer()
        {
            Thread httpThread = new Thread(HttpServerLoop);
            httpThread.IsBackground = true;
            httpThread.Start();
        }

        private static void HttpServerLoop()
        {
            try
            {
                _listener = new HttpListener();
                _listener.Prefixes.Add("http://127.0.0.1:" + Port + "/");
                _listener.Prefixes.Add("http://localhost:" + Port + "/");
                _listener.Start();
                WriteLog("[CanonBridge] HTTP Server listening on http://127.0.0.1:" + Port + "/");

                while (_isRunning)
                {
                    try
                    {
                        HttpListenerContext context = _listener.GetContext();
                        ThreadPool.QueueUserWorkItem((state) => ProcessRequest((HttpListenerContext)state), context);
                    }
                    catch (HttpListenerException)
                    {
                        break;
                    }
                    catch (Exception ex)
                    {
                        if (!_isRunning) break;
                        WriteLog("[CanonBridge] HTTP Error: " + ex.Message);
                    }
                }
            }
            catch (Exception ex)
            {
                WriteLog("[CanonBridge] Fatal HTTP Listener Error: " + ex.Message);
            }
        }

        private static void ProcessRequest(HttpListenerContext context)
        {
            HttpListenerRequest request = context.Request;
            HttpListenerResponse response = context.Response;

            // CORS headers
            response.Headers.Add("Access-Control-Allow-Origin", "*");
            response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            response.Headers.Add("Access-Control-Allow-Headers", "Content-Type");

            if (request.HttpMethod == "OPTIONS")
            {
                response.StatusCode = 200;
                response.Close();
                return;
            }

            string rawUrl = request.RawUrl.ToLower();
            string path = request.Url.AbsolutePath.ToLower();

            try
            {
                if (path == "/status" || path == "/")
                {
                    HandleStatus(response);
                }
                else if (path == "/liveview" || path == "/liveview.jpg")
                {
                    HandleLiveView(response);
                }
                else if (path == "/liveview/start")
                {
                    bool started = StartLiveViewInternal();
                    SendJson(response, 200, "{\"success\":" + (started ? "true" : "false") + "}");
                }
                else if (path == "/liveview/stop")
                {
                    StopLiveViewInternal();
                    SendJson(response, 200, "{\"success\":true}");
                }
                else if (path == "/capture")
                {
                    HandleCapture(request, response);
                }
                else if (path == "/shutdown")
                {
                    SendJson(response, 200, "{\"success\":true,\"message\":\"Shutting down\"}");
                    _isRunning = false;
                    new Thread(() =>
                    {
                        Thread.Sleep(500);
                        Environment.Exit(0);
                    }).Start();
                }
                else
                {
                    response.StatusCode = 404;
                    SendJson(response, 404, "{\"error\":\"Not found\"}");
                }
            }
            catch (Exception ex)
            {
                WriteLog("[CanonBridge] Request processing error: " + ex.Message);
                try
                {
                    response.StatusCode = 500;
                    SendJson(response, 500, "{\"error\":\"" + ex.Message.Replace("\"", "\\\"") + "\"}");
                }
                catch { }
            }
        }

        private static void HandleStatus(HttpListenerResponse response)
        {
            EnsureCanonInitialized();
            ICameraDevice camera = _manager != null ? _manager.SelectedCameraDevice : null;
            if ((camera == null || !camera.IsConnected) && _manager != null && _manager.ConnectedDevices != null)
            {
                foreach (var dev in _manager.ConnectedDevices)
                {
                    if (dev != null && dev.IsConnected)
                    {
                        _manager.SelectedCameraDevice = dev;
                        camera = dev;
                        break;
                    }
                }
            }
            bool connected = camera != null && camera.IsConnected;
            string model = connected ? camera.DeviceName : "No Camera";
            string manufacturer = connected ? camera.Manufacturer : "";
            int battery = connected ? camera.Battery : 0;
            bool isBusy = connected && camera.IsBusy;

            string json = string.Format(
                "{{\"ok\":true,\"connected\":{0},\"model\":\"{1}\",\"manufacturer\":\"{2}\",\"battery\":{3},\"isLiveView\":{4},\"isBusy\":{5}}}",
                connected ? "true" : "false",
                EscapeJson(model),
                EscapeJson(manufacturer),
                battery,
                _isLiveViewRunning ? "true" : "false",
                isBusy ? "true" : "false"
            );

            SendJson(response, 200, json);
        }

        private static void HandleLiveView(HttpListenerResponse response)
        {
            if (_isCapturing)
            {
                response.StatusCode = 503;
                SendJson(response, 503, "{\"error\":\"Capture in progress\"}");
                return;
            }

            // Auto start live view if not running
            if (!_isLiveViewRunning)
            {
                StartLiveViewInternal();
            }

            byte[] frame = null;
            lock (_frameLock)
            {
                frame = _latestFrame;
            }

            if (frame == null || frame.Length == 0)
            {
                response.StatusCode = 503;
                SendJson(response, 503, "{\"error\":\"No live view frame available yet\"}");
                return;
            }

            response.ContentType = "image/jpeg";
            response.ContentLength64 = frame.Length;
            response.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate");
            response.Headers.Add("Pragma", "no-cache");
            response.Headers.Add("Expires", "0");
            response.OutputStream.Write(frame, 0, frame.Length);
            response.OutputStream.Flush();
            response.Close();
        }

        private static void HandleCapture(HttpListenerRequest request, HttpListenerResponse response)
        {
            lock (_captureLock)
            {
                ICameraDevice camera = _manager != null ? _manager.SelectedCameraDevice : null;
                if (camera == null || !camera.IsConnected)
                {
                    SendJson(response, 400, "{\"success\":false,\"error\":\"No camera connected\"}");
                    return;
                }

                _isCapturing = true;
                bool wasStreaming = _isLiveViewRunning;

                try
                {
                    // Check for custom savePath in query string
                    string savePath = request.QueryString["savePath"];
                    _targetCapturePath = savePath;
                    _capturedFilePath = null;
                    _captureEvent.Reset();

                    // If live view is streaming, stop it and wait for worker thread to stop
                    if (wasStreaming)
                    {
                        WriteLog("[CanonBridge] Stopping Live View before capture...");
                        StopLiveViewInternal();
                        Thread.Sleep(300);
                    }

                    // Re-register photo event & ensure CaptureInSdRam is active
                    try
                    {
                        camera.PhotoCaptured -= OnPhotoCaptured;
                        camera.PhotoCaptured += OnPhotoCaptured;
                        camera.CaptureInSdRam = true;
                    }
                    catch { }

                    WriteLog("[CanonBridge] Triggering Camera Capture...");
                    TriggerShutter(camera);

                    // Wait up to 25 seconds for file transfer to complete
                    DateTime waitStart = DateTime.Now;
                    bool captured = false;
                    while ((DateTime.Now - waitStart).TotalMilliseconds < 25000)
                    {
                        if (_captureEvent.WaitOne(100))
                        {
                            if (!string.IsNullOrEmpty(_capturedFilePath) && File.Exists(_capturedFilePath))
                            {
                                captured = true;
                                break;
                            }
                        }
                    }

                    if (captured && !string.IsNullOrEmpty(_capturedFilePath) && File.Exists(_capturedFilePath))
                    {
                        WriteLog("[CanonBridge] Capture succeeded: " + _capturedFilePath);
                        string json = "{\"success\":true,\"filePath\":\"" + EscapeJson(_capturedFilePath) + "\"}";
                        SendJson(response, 200, json);
                    }
                    else
                    {
                        WriteLog("[CanonBridge] Capture timeout or failed to receive file.");
                        SendJson(response, 504, "{\"success\":false,\"error\":\"Capture timeout or file transfer failed\"}");
                    }
                }
                catch (Exception ex)
                {
                    WriteLog("[CanonBridge] Capture exception: " + ex.Message);
                    SendJson(response, 500, "{\"success\":false,\"error\":\"" + EscapeJson(ex.Message) + "\"}");
                }
                finally
                {
                    _isCapturing = false;
                    _targetCapturePath = null;

                    // Resume live view if it was running before
                    if (wasStreaming)
                    {
                        new Thread(() =>
                        {
                            Thread.Sleep(500);
                            StartLiveViewInternal();
                        }).Start();
                    }
                }
            }
        }

        private static void TriggerShutter(ICameraDevice camera)
        {
            CanonSDKBase canonBase = camera as CanonSDKBase;
            if (canonBase != null && canonBase.Camera != null)
            {
                EosCamera eosCam = canonBase.Camera;
                IntPtr hCam = eosCam.Handle;

                // Ensure Save Location to Host (does not require SD card in camera)
                string tempDir = Path.Combine(Path.GetTempPath(), "camera-sync-agent");
                if (!Directory.Exists(tempDir)) Directory.CreateDirectory(tempDir);
                try
                {
                    eosCam.SavePicturesToHost(tempDir);
                    WriteLog("[CanonBridge] Set save location: Host");
                }
                catch (Exception ex)
                {
                    WriteLog("[CanonBridge] Note on SavePicturesToHost: " + ex.Message);
                }

                // Check and log DriveMode, and attempt to set Single Shooting (0)
                try
                {
                    uint currentDriveMode = 0;
                    uint getRes = EdsGetPropertyData(hCam, 0x00000106, 0, 4, out currentDriveMode);
                    WriteLog(string.Format("[CanonBridge] Current DriveMode: 0x{0:X} (status: 0x{1:X})", currentDriveMode, getRes));
                    if (currentDriveMode != 0)
                    {
                        WriteLog("[CanonBridge] DriveMode is not Single shooting (0x" + currentDriveMode.ToString("X") + "). Setting DriveMode to Single frame (0)...");
                        uint singleMode = 0;
                        uint setRes = EdsSetPropertyData(hCam, 0x00000106, 0, 4, ref singleMode);
                        WriteLog(string.Format("[CanonBridge] Set DriveMode result: 0x{0:X}", setRes));
                    }
                }
                catch (Exception ex)
                {
                    WriteLog("[CanonBridge] Note on DriveMode: " + ex.Message);
                }

                // Method 1: TakePicture (Command 0, Param 0)
                WriteLog("[CanonBridge] Sending TakePicture(0, 0)...");
                uint res = Edsdk.EdsSendCommand(hCam, 0, 0);
                WriteLog("[CanonBridge] TakePicture(0, 0) returned: 0x" + res.ToString("X"));

                if (res == 0)
                {
                    WriteLog("[CanonBridge] TakePicture command accepted (0x0). Waiting for photo transfer...");
                    return;
                }

                // Method 2: PressShutterButton Completely_NonAF (65539 = 0x00010003)
                WriteLog("[CanonBridge] Sending PressShutterButton Completely_NonAF (65539)...");
                res = Edsdk.EdsSendCommand(hCam, 4, 65539);
                WriteLog("[CanonBridge] PressShutterButton(65539) returned: 0x" + res.ToString("X"));
                Thread.Sleep(50);
                Edsdk.EdsSendCommand(hCam, 4, 0); // Release button immediately
                WriteLog("[CanonBridge] Shutter button released (OFF)");

                if (res == 0)
                {
                    return;
                }
            }

            // Method 3: Fallback to SDK methods
            try
            {
                WriteLog("[CanonBridge] Trying camera.CapturePhotoNoAf()...");
                camera.CapturePhotoNoAf();
            }
            catch (Exception ex)
            {
                WriteLog("[CanonBridge] CapturePhotoNoAf error: " + ex.Message);
            }
        }

        private static void SendJson(HttpListenerResponse response, int statusCode, string json)
        {
            response.StatusCode = statusCode;
            response.ContentType = "application/json; charset=utf-8";
            byte[] buffer = Encoding.UTF8.GetBytes(json);
            response.ContentLength64 = buffer.Length;
            response.OutputStream.Write(buffer, 0, buffer.Length);
            response.OutputStream.Flush();
            response.Close();
        }

        private static string EscapeJson(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", "");
        }

        private static void Cleanup()
        {
            WriteLog("[CanonBridge] Cleaning up...");
            _isRunning = false;
            StopLiveViewInternal();

            if (_listener != null)
            {
                try { _listener.Stop(); _listener.Close(); } catch { }
            }

            if (_manager != null)
            {
                try { _manager.CloseAll(); } catch { }
            }
        }
    }
}
