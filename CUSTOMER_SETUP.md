# UWC Energy Monitor — Customer setup (Windows)

## First-time setup

1. Download and install the current **Node.js LTS** release from the official site: https://nodejs.org/en/download/ . Ensure the installer includes npm. Close and reopen any existing terminal after installation.
2. Extract the UWC Energy Monitor ZIP to a permanent folder. Keep the files together; do not run the batch files from inside the ZIP.
3. Double-click **Initial setup.bat**. A PowerShell window opens in the application folder and runs `npm install`. Wait for the message: **Setup complete, Use "Run Service.bat" to launch the service**. If installation fails, read the error in the PowerShell window.
4. Double-click **Run Service.bat**. A PowerShell window starts the server and prints its local and network addresses. Your default browser opens `http://localhost:3000` after the health check responds. Keep the service PowerShell window open while using the app. To stop it, press **Ctrl+C** in that window.

## Other computers and phones

Use one of the LAN URLs shown in the service window, such as `http://192.168.x.x:3000`. The browser opened by Run Service.bat is on the **server computer** only. Windows Firewall and third-party security software (including ESET) may require allowing inbound **TCP 3000** for web access and **UDP 4210** for EnergyGuard discovery. See `NETWORK_SETUP.md` for details.

## Notes

- The batch files must stay in the project root beside `package.json`.
- `Initial setup.bat` is only needed for initial installation or after dependencies change.
- Run Service.bat uses the app's default port **3000**. If you change the app's `PORT` setting, update its browser-opening URL accordingly.
- These launchers are intended for interactive Windows desktop use, not unattended Windows Service installation.
