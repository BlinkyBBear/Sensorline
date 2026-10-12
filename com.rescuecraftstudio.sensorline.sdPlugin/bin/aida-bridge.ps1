# Sensorline AIDA64 bridge.
# Reads External Applications data without administrator rights:
#   1. shared memory AIDA64_SensorValues
#   2. WMI root\wmi AIDA64_SensorValues
#   3. HKCU\Software\FinalWire\AIDA64\SensorValues
# Speaks one JSON line per "read" command. Payloads are base64 so XML
# newlines cannot break the protocol.

$ProgressPreference = "SilentlyContinue"
$WarningPreference = "SilentlyContinue"
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class SensorlineAidaMap {
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern IntPtr OpenFileMapping(uint dwDesiredAccess, bool bInheritHandle, string lpName);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern IntPtr MapViewOfFile(IntPtr hFileMappingObject, uint dwDesiredAccess, uint dwFileOffsetHigh, uint dwFileOffsetLow, UIntPtr dwNumberOfBytesToMap);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool UnmapViewOfFile(IntPtr lpBaseAddress);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool CloseHandle(IntPtr hObject);
  public const uint FILE_MAP_READ = 4;

  public static string Read(string name, int maxBytes) {
    IntPtr handle = OpenFileMapping(FILE_MAP_READ, false, name);
    if (handle == IntPtr.Zero) return null;
    IntPtr view = IntPtr.Zero;
    try {
      view = MapViewOfFile(handle, FILE_MAP_READ, 0, 0, UIntPtr.Zero);
      if (view == IntPtr.Zero) return null;
      int b0 = Marshal.ReadByte(view, 0);
      if (b0 == 0) return "";
      int b1 = 1;
      try { b1 = Marshal.ReadByte(view, 1); } catch { b1 = 1; }
      if (b1 == 0) {
        int chars = 0;
        while (chars < maxBytes / 2) {
          int lo = Marshal.ReadByte(view, chars * 2);
          int hi = Marshal.ReadByte(view, chars * 2 + 1);
          if (lo == 0 && hi == 0) break;
          chars++;
        }
        if (chars == 0) return "";
        byte[] wide = new byte[chars * 2];
        Marshal.Copy(view, wide, 0, wide.Length);
        return Encoding.Unicode.GetString(wide);
      }
      int len = 0;
      while (len < maxBytes && Marshal.ReadByte(view, len) != 0) len++;
      byte[] buf = new byte[len];
      if (len > 0) Marshal.Copy(view, buf, 0, len);
      return Encoding.UTF8.GetString(buf);
    } finally {
      if (view != IntPtr.Zero) UnmapViewOfFile(view);
      CloseHandle(handle);
    }
  }
}
"@

function Convert-ToB64([string]$text) {
  if ([string]::IsNullOrEmpty($text)) { return "" }
  return [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($text))
}

function Write-Bridge([hashtable]$obj) {
  $json = $obj | ConvertTo-Json -Compress -Depth 6
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}

function Read-SharedMemory {
  foreach ($name in @("AIDA64_SensorValues", "Local\AIDA64_SensorValues", "Global\AIDA64_SensorValues")) {
    try {
      $text = [SensorlineAidaMap]::Read($name, 262144)
      if ($text -and $text.Contains("<id>")) { return $text }
    } catch {
      continue
    }
  }
  return $null
}

function Read-WmiFeed {
  try {
    $rows = @(Get-CimInstance -Namespace "root\wmi" -ClassName "AIDA64_SensorValues" -ErrorAction Stop)
  } catch {
    return $null
  }
  if ($rows.Count -eq 0) { return $null }
  $chunks = New-Object System.Collections.Generic.List[string]
  $map = @{}
  foreach ($row in $rows) {
    foreach ($prop in $row.CimInstanceProperties) {
      if ($prop.Name -match "^(PSComputerName|CimClass|CimInstanceProperties|CimSystemProperties)$") { continue }
      if ($null -eq $prop.Value) { continue }
      $val = [string]$prop.Value
      if ([string]::IsNullOrWhiteSpace($val)) { continue }
      if ($val.Contains("<id>")) { $chunks.Add($val) } else { $map[$prop.Name] = $val }
    }
  }
  if ($chunks.Count -gt 0) { return @{ kind = "xml"; text = ($chunks -join "") } }
  if ($map.Count -gt 0) { return @{ kind = "map"; text = ($map | ConvertTo-Json -Compress -Depth 4) } }
  return $null
}

function Read-RegistryFeed {
  $path = "HKCU:\Software\FinalWire\AIDA64\SensorValues"
  if (-not (Test-Path $path)) { return $null }
  $item = Get-ItemProperty -Path $path
  $map = @{}
  foreach ($prop in $item.PSObject.Properties) {
    if ($prop.Name -match "^(PSPath|PSParentPath|PSChildName|PSDrive|PSProvider)$") { continue }
    if ($null -eq $prop.Value) { continue }
    $map[$prop.Name] = [string]$prop.Value
  }
  if ($map.Count -eq 0) { return $null }
  $joined = ($map.Values -join "")
  if ($joined.Contains("<id>") -and $map.Count -eq 1) {
    return @{ kind = "xml"; text = [string]($map.Values | Select-Object -First 1) }
  }
  return @{ kind = "map"; text = ($map | ConvertTo-Json -Compress -Depth 4) }
}

function Test-AidaRunning {
  $proc = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like "aida64*" }
  return $null -ne $proc
}

function Read-Once {
  $shm = Read-SharedMemory
  if ($shm) {
    Write-Bridge @{ ok = $true; source = "shared-memory"; kind = "xml"; payload = (Convert-ToB64 $shm); reason = "live"; detail = "Shared memory" }
    return
  }
  $wmi = Read-WmiFeed
  if ($null -ne $wmi) {
    Write-Bridge @{ ok = $true; source = "wmi"; kind = $wmi.kind; payload = (Convert-ToB64 $wmi.text); reason = "live"; detail = "WMI" }
    return
  }
  $reg = Read-RegistryFeed
  if ($null -ne $reg) {
    Write-Bridge @{ ok = $true; source = "registry"; kind = $reg.kind; payload = (Convert-ToB64 $reg.text); reason = "live"; detail = "Registry" }
    return
  }
  if (Test-AidaRunning) {
    Write-Bridge @{ ok = $false; source = "none"; kind = "xml"; payload = ""; reason = "sharing-off"; detail = "AIDA64 is running, but External Applications sharing is off." }
  } else {
    Write-Bridge @{ ok = $false; source = "none"; kind = "xml"; payload = ""; reason = "not-running"; detail = "AIDA64 is not running." }
  }
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $cmd = $line.Trim().ToLowerInvariant()
  if ($cmd -eq "quit") { break }
  if ($cmd -ne "read") { continue }
  try {
    Read-Once
  } catch {
    Write-Bridge @{ ok = $false; source = "none"; kind = "xml"; payload = ""; reason = "error"; detail = $_.Exception.Message }
  }
}
