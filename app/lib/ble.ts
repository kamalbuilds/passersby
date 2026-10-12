import { Linking, PermissionsAndroid, Platform, type Permission } from 'react-native'

export type BlePermission = 'granted' | 'denied' | 'blocked'

function required(): Permission[] {
  if (Platform.OS !== 'android') return []
  // Android 12+ has dedicated Bluetooth permissions. Earlier versions gate BLE scans behind location.
  if (Number(Platform.Version) >= 31) {
    return [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]
  }
  return [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]
}

export async function hasBlePermission(): Promise<boolean> {
  const perms = required()
  const checks = await Promise.all(perms.map((p) => PermissionsAndroid.check(p)))
  return checks.every(Boolean)
}

/** 'blocked' means Android will no longer show the prompt, so the only fix is the system settings page. */
export async function requestBlePermission(): Promise<BlePermission> {
  const perms = required()
  if (perms.length === 0) return 'granted'
  const result = await PermissionsAndroid.requestMultiple(perms)
  const values = Object.values(result)
  if (values.every((r) => r === PermissionsAndroid.RESULTS.GRANTED)) return 'granted'
  return values.some((r) => r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) ? 'blocked' : 'denied'
}

export const openAppSettings = () => Linking.openSettings()

export const openBluetoothSettings = () => Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS')
