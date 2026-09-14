using System;
using System.IO;
using System.Threading;
using System.Reflection;
using System.Runtime.InteropServices;
using CameraControl.Devices;
using CameraControl.Devices.Classes;
using CameraControl.Devices.Canon;
using Canon.Eos.Framework;

class TestCaptureSession
{
    [DllImport("EDSDK.dll")]
    public static extern uint EdsGetEvent();

    [DllImport("EDSDK.dll")]
    public static extern uint EdsSendCommand(IntPtr inCameraRef, uint inCommand, int inParam);

    static void Main()
    {
        Log.LogDebug += (e) => Console.WriteLine("[LOG-D] " + e.Message);
        Log.LogError += (e) => Console.WriteLine("[LOG-E] " + e.Message + (e.Exception != null ? ": " + e.Exception.Message : ""));
        Log.LogInfo += (e) => Console.WriteLine("[LOG-I] " + e.Message);

        Console.WriteLine("[TEST] Initializing CameraDeviceManager...");
        CameraDeviceManager manager = new CameraDeviceManager();
        manager.UseExperimentalDrivers = false;
        manager.DisableNativeDrivers = false;
        manager.DetectWebcams = false;
        manager.LoadWiaDevices = false;

        string outDir = Path.Combine(Path.GetTempPath(), "test_canon_capture");
        if (!Directory.Exists(outDir)) Directory.CreateDirectory(outDir);

        manager.PhotoCaptured += (s, e) =>
        {
            Console.WriteLine("[EVENT] manager.PhotoCaptured: " + e.FileName);
            try
            {
                string target = Path.Combine(outDir, "manager_cap_" + DateTime.Now.Ticks + ".jpg");
                e.CameraDevice.TransferFile(e.Handle, target);
                Console.WriteLine("[EVENT] manager.PhotoCaptured transferred: " + target + " (" + new FileInfo(target).Length + " bytes)");
            }
            catch (Exception ex)
            {
                Console.WriteLine("[EVENT] manager transfer failed: " + ex.Message);
            }
        };

        var initMethod = typeof(CameraDeviceManager).GetMethod("InitCanon", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
        if (initMethod != null) initMethod.Invoke(manager, null);

        ICameraDevice cam = null;
        for (int retry = 0; retry < 5; retry++)
        {
            var addMethod = typeof(CameraDeviceManager).GetMethod("AddCanonCameras", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
            if (addMethod != null) addMethod.Invoke(manager, null);

            if (manager.ConnectedDevices != null && manager.ConnectedDevices.Count > 0)
            {
                foreach (var d in manager.ConnectedDevices)
                {
                    if (d != null && d.IsConnected) { cam = d; break; }
                }
            }
            if (cam != null) break;
            Console.WriteLine("[TEST] Waiting for camera connect... retry " + retry);
            Thread.Sleep(2000);
        }

        if (cam == null && manager.ConnectedDevices.Count > 0)
        {
            Console.WriteLine("[TEST] Camera present but IsConnected=False. Trying to reconnect...");
            manager.ConnectToCamera();
            cam = manager.SelectedCameraDevice;
        }

        if (cam == null || !cam.IsConnected)
        {
            Console.WriteLine("[TEST] FAILED to connect to camera!");
            manager.CloseAll();
            return;
        }

        Console.WriteLine("[TEST] Camera connected successfully: " + cam.DeviceName + " | IsConnected: " + cam.IsConnected);
        cam.PhotoCaptured += (s, e) =>
        {
            Console.WriteLine("[EVENT] cam.PhotoCaptured: " + e.FileName);
            try
            {
                string target = Path.Combine(outDir, "cam_cap_" + DateTime.Now.Ticks + ".jpg");
                e.CameraDevice.TransferFile(e.Handle, target);
                Console.WriteLine("[EVENT] cam.PhotoCaptured transferred: " + target + " (" + new FileInfo(target).Length + " bytes)");
            }
            catch (Exception ex)
            {
                Console.WriteLine("[EVENT] cam transfer failed: " + ex.Message);
            }
        };

        CanonSDKBase canonBase = cam as CanonSDKBase;
        EosCamera eosCam = canonBase != null ? canonBase.Camera : null;
        if (eosCam != null)
        {
            Console.WriteLine("[TEST] ImageQuality: Primary=" + eosCam.ImageQuality.PrimaryImageFormat + ", Secondary=" + eosCam.ImageQuality.SecondaryImageFormat);
            Console.WriteLine("[TEST] SaveLocation: setting to Host...");
            eosCam.SavePicturesToHost(outDir);
            Console.WriteLine("[TEST] CaptureInSdRam = " + cam.CaptureInSdRam);
            cam.CaptureInSdRam = true;

            // Test 1: Completely_NonAF (65539)
            Console.WriteLine("\n[TEST] ---> Testing PressShutterButton(Completely_NonAF = 65539)");
            uint err = EdsSendCommand(eosCam.Handle, 4, 65539);
            Console.WriteLine("[TEST] PressShutterButton(65539) returned: 0x" + err.ToString("X"));
            Thread.Sleep(300);
            uint errRel = EdsSendCommand(eosCam.Handle, 4, 0);
            Console.WriteLine("[TEST] PressShutterButton(0) released: 0x" + errRel.ToString("X"));

            Console.WriteLine("[TEST] Pumping events for 5s...");
            DateTime t0 = DateTime.Now;
            while ((DateTime.Now - t0).TotalSeconds < 5)
            {
                EdsGetEvent();
                Thread.Sleep(50);
            }

            // Test 2: TakePicture (0, 0)
            Console.WriteLine("\n[TEST] ---> Testing CameraCommand_TakePicture (0, 0)");
            err = EdsSendCommand(eosCam.Handle, 0, 0);
            Console.WriteLine("[TEST] TakePicture(0, 0) returned: 0x" + err.ToString("X"));

            Console.WriteLine("[TEST] Pumping events for 5s...");
            t0 = DateTime.Now;
            while ((DateTime.Now - t0).TotalSeconds < 5)
            {
                EdsGetEvent();
                Thread.Sleep(50);
            }

            // Test 3: canonBase.CapturePhotoNoAf()
            Console.WriteLine("\n[TEST] ---> Testing canonBase.CapturePhotoNoAf()");
            try
            {
                canonBase.CapturePhotoNoAf();
                Console.WriteLine("[TEST] CapturePhotoNoAf executed without exception");
            }
            catch (Exception ex)
            {
                Console.WriteLine("[TEST] CapturePhotoNoAf threw: " + ex.Message);
            }

            Console.WriteLine("[TEST] Pumping events for 5s...");
            t0 = DateTime.Now;
            while ((DateTime.Now - t0).TotalSeconds < 5)
            {
                EdsGetEvent();
                Thread.Sleep(50);
            }
        }

        Console.WriteLine("\n[TEST] All tests completed. Cleaning up...");
        manager.CloseAll();
    }
}
