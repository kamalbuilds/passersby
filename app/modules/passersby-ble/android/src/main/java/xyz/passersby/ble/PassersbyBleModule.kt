package xyz.passersby.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// 0xFFFF is the Bluetooth SIG company id reserved for testing. Payload: "PB" + 16-byte token.
private const val COMPANY_ID = 0xFFFF
private val MAGIC = byteArrayOf(0x50, 0x42)
private const val TOKEN_LEN = 16

@SuppressLint("MissingPermission")
class PassersbyBleModule : Module() {
  private var advertiseCallback: AdvertiseCallback? = null
  private var scanCallback: ScanCallback? = null

  private fun adapter(): BluetoothAdapter? {
    val ctx = appContext.reactContext ?: return null
    return (ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
  }

  override fun definition() = ModuleDefinition {
    Name("PassersbyBle")
    Events("onSighting", "onError")

    Function("isEnabled") { adapter()?.isEnabled == true }

    Function("start") { tokenHex: String ->
      val token = hexToBytes(tokenHex)
      if (token.size != TOKEN_LEN) throw CodedException("ERR_TOKEN", "token must be $TOKEN_LEN bytes", null)
      stop()
      val adapter = adapter() ?: throw CodedException("ERR_NO_BLUETOOTH", "No Bluetooth adapter", null)
      if (!adapter.isEnabled) throw CodedException("ERR_BT_OFF", "Bluetooth is off", null)

      val advertiser = adapter.bluetoothLeAdvertiser
        ?: throw CodedException("ERR_NO_ADVERTISER", "This device cannot advertise over BLE", null)
      val settings = AdvertiseSettings.Builder()
        .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
        .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
        .setConnectable(false)
        .build()
      val data = AdvertiseData.Builder()
        .setIncludeDeviceName(false)
        .addManufacturerData(COMPANY_ID, MAGIC + token)
        .build()
      val adCb = object : AdvertiseCallback() {
        override fun onStartFailure(errorCode: Int) {
          sendEvent("onError", mapOf("stage" to "advertise", "code" to errorCode))
        }
      }
      advertiser.startAdvertising(settings, data, adCb)
      advertiseCallback = adCb

      val scanner = adapter.bluetoothLeScanner
        ?: throw CodedException("ERR_NO_SCANNER", "This device cannot scan over BLE", null)
      val filter = ScanFilter.Builder()
        .setManufacturerData(COMPANY_ID, MAGIC, byteArrayOf(0xFF.toByte(), 0xFF.toByte()))
        .build()
      val scanSettings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
      val scCb = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
          val payload = result.scanRecord?.getManufacturerSpecificData(COMPANY_ID) ?: return
          if (payload.size != MAGIC.size + TOKEN_LEN || payload[0] != MAGIC[0] || payload[1] != MAGIC[1]) return
          sendEvent("onSighting", mapOf(
            "token" to bytesToHex(payload.copyOfRange(MAGIC.size, payload.size)),
            "rssi" to result.rssi,
            "at" to System.currentTimeMillis()
          ))
        }
        override fun onScanFailed(errorCode: Int) {
          sendEvent("onError", mapOf("stage" to "scan", "code" to errorCode))
        }
      }
      scanner.startScan(listOf(filter), scanSettings, scCb)
      scanCallback = scCb
    }

    Function("stop") { stop() }

    OnDestroy { stop() }
  }

  private fun stop() {
    val adapter = adapter() ?: return
    advertiseCallback?.let { adapter.bluetoothLeAdvertiser?.stopAdvertising(it) }
    scanCallback?.let { adapter.bluetoothLeScanner?.stopScan(it) }
    advertiseCallback = null
    scanCallback = null
  }

  private fun hexToBytes(hex: String): ByteArray {
    if (hex.length % 2 != 0) throw CodedException("ERR_TOKEN", "odd hex length", null)
    return ByteArray(hex.length / 2) { i -> hex.substring(i * 2, i * 2 + 2).toInt(16).toByte() }
  }

  private fun bytesToHex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it) }
}
