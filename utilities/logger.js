const fs = require('fs');
const path = require('path');

class ScanLogger {
  constructor(scanId, scanType) {
    this.scanId = scanId;
    this.scanType = scanType;
    this.logs = [];
    this.startTime = new Date();
  }

  log(category, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      category,
      message,
      data: data ? JSON.stringify(data, null, 2) : null
    };

    this.logs.push(logEntry);

    // Console output with prefix
    const prefix = `[${this.scanType.toUpperCase()}-${category}]`;
    console.log(`${prefix} ${message}`);
    if (data) {
      console.log(`${prefix} Data:`, data);
    }
  }

  error(category, message, error) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      category,
      level: 'ERROR',
      message,
      error: {
        message: error.message,
        stack: error.stack
      }
    };

    this.logs.push(logEntry);

    console.error(`[${this.scanType.toUpperCase()}-${category}] ERROR: ${message}`);
    console.error(`[${this.scanType.toUpperCase()}-${category}]`, error);
  }

  saveToFile() {
    const logDir = path.join(__dirname, '../debug-analysis/logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, `${this.scanId}.log.json`);
    const logContent = {
      scanId: this.scanId,
      scanType: this.scanType,
      startTime: this.startTime,
      endTime: new Date(),
      duration: Date.now() - this.startTime.getTime(),
      logs: this.logs
    };

    fs.writeFileSync(logFile, JSON.stringify(logContent, null, 2));
    console.log(`[LOGGER] Saved log file: ${logFile}`);
    return logFile;
  }

  getTextLog() {
    return this.logs.map(entry => {
      let line = `[${entry.timestamp}] [${entry.category}]`;
      if (entry.level) line += ` [${entry.level}]`;
      line += ` ${entry.message}`;
      if (entry.data) line += `\n${entry.data}`;
      if (entry.error) line += `\nError: ${entry.error.message}\n${entry.error.stack}`;
      return line;
    }).join('\n\n');
  }
}

module.exports = ScanLogger;
