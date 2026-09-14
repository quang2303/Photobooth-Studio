export class Logger {
  constructor(consoleLogsElement) {
    this.consoleLogs = consoleLogsElement;
  }

  addLog(message, isError = false, isSuccess = false) {
    if (!this.consoleLogs) return;

    const line = document.createElement('div');
    line.className = 'log-line';
    
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    
    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'log-timestamp';
    timestampSpan.textContent = `[${timeStr}]`;
    
    const msgSpan = document.createElement('span');
    msgSpan.className = 'log-msg';
    if (isError) msgSpan.classList.add('error');
    if (isSuccess) msgSpan.classList.add('success');
    msgSpan.textContent = message;
    
    line.appendChild(timestampSpan);
    line.appendChild(msgSpan);
    
    this.consoleLogs.appendChild(line);
    this.consoleLogs.scrollTop = this.consoleLogs.scrollHeight;
  }

  clear() {
    if (this.consoleLogs) {
      this.consoleLogs.innerHTML = '';
    }
  }
}
