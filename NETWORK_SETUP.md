# UWC Energy Monitor — Local Network Deployment

The server is designed to run on one machine and be opened from workstations, tablets, or phones on the same trusted local network.

## Default addresses

By default the service listens on all network interfaces:

```text
HOST=0.0.0.0
PORT=3000
```

On the server itself, open:

```text
http://localhost:3000
```

From another device on the same LAN, use the server machine's IPv4 address, for example:

```text
http://192.168.1.39:3000
```

The startup log lists the detected LAN addresses automatically.

## Find the server IPv4 address on Windows

Run:

```powershell
ipconfig
```

Use the IPv4 address of the active Ethernet or Wi-Fi adapter. Do not enter `0.0.0.0` in a browser; it is a listening address, not a client address.

## Windows network profile

Check the active profile:

```powershell
Get-NetConnectionProfile
```

For a trusted site LAN, the active connection should normally be `Private` or domain-authenticated. To change a Wi-Fi adapter to Private, run PowerShell as Administrator:

```powershell
Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
```

## Windows Firewall rule

Run PowerShell as Administrator:

```powershell
New-NetFirewallRule `
  -DisplayName "UWC Energy Monitor TCP 3000" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 3000 `
  -Action Allow `
  -Profile Private,Domain
```

Remove the rule with:

```powershell
Remove-NetFirewallRule -DisplayName "UWC Energy Monitor TCP 3000"
```

Avoid enabling the rule for Public networks unless the site's IT policy explicitly requires it.

## ESET and other endpoint-security software

Endpoint-security products may silently block `node.exe` even when Windows Firewall is configured correctly.

For ESET Home/Smart Security:

1. Open **Advanced setup**.
2. Go to **Protections → Network access protection → Firewall**.
3. Check the troubleshooting or recently blocked applications section.
4. Allow `C:\Program Files\nodejs\node.exe` for inbound communication on the trusted local network.

This project was verified over the LAN only after ESET's hidden block for Node.js was changed to Allow.

Other security suites may have equivalent application-control or firewall rules.

## Connectivity checks

Confirm Node is listening on all interfaces:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

Expected `LocalAddress`:

```text
0.0.0.0
```

Test locally using the LAN address:

```powershell
Test-NetConnection -ComputerName 192.168.1.39 -Port 3000
```

Test the lightweight health endpoint from a browser:

```text
http://192.168.1.39:3000/health
```

A healthy response includes the application version, uptime, configured host and port, and detected network addresses.

## Configurable host and port

PowerShell example:

```powershell
$env:HOST = "0.0.0.0"
$env:PORT = "3000"
npm start
```

The server rejects an empty host or a port outside `1`–`65535`.

## Recommended site deployment

- Use a DHCP reservation or static IP for the server.
- Use a local DNS hostname where the site network supports it.
- Do not forward port 3000 through the internet router.
- Keep the service on a trusted Private or Domain network.
- The current application has no user authentication; anyone with permitted LAN access may be able to change site or device settings.
- Internet-facing deployment requires HTTPS, authentication, access control, and additional security hardening.

## Troubleshooting order

1. Confirm `npm start` is running.
2. Confirm `0.0.0.0:3000` is listening.
3. Confirm the server can open its own LAN URL.
4. Ping the server from the client device.
5. Test `/health` from the client device.
6. Check Windows Firewall.
7. Check ESET or other endpoint-security troubleshooting logs.
8. Check Wi-Fi client isolation or site-network access-control policies.

## EnergyGuard automatic discovery (v1.9.0)

Allow inbound **UDP 4210** to the Node.js server in Windows Firewall and ESET. The server must be on a network that receives the meters' UDP broadcasts. Stop any PowerShell UDP listener using port 4210 before starting the app. Open **Add Device** and select a meter from the discovered list. Registered meters will not be offered again. The meter's IP may change through DHCP; subsequent announcements refresh its stored address. Discovery does not yet enable live measurement ingestion.

## v1.9.1 live measurements

EnergyGuard broadcasts on UDP 4210 update registered meters live. The current firmware example advertises `calibrated: false` and does not supply a measured power factor. The app displays its voltage/current values but intentionally does not write these uncalibrated samples to the billable energy history. When firmware reports `calibrated: true`, `valid: true` and `power_factor` between 0 and 1, calibrated measurements can be stored. UDP broadcasts must reach the server; allow UDP 4210 through local firewall/endpoint security.

### Meter measurement convention (v1.9.2)
Live UDP voltage and current are accepted when valid, regardless of calibration status. Power displayed as kW is calculated as V × A / 1000 (technically apparent power in kVA). Historical energy and costs are estimates.
