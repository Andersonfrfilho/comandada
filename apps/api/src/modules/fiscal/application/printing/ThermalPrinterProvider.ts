import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer'
import {
  buildFiscalCupomText,
  type FiscalCupomData,
  type PrinterProvider,
  type PrintResult,
} from './PrinterProvider.interface'

// Connection string for the thermal printer, e.g. 'tcp://192.168.0.50:9100' or 'printer:auto'.
const PRINTER_INTERFACE = process.env.FISCAL_PRINTER_INTERFACE

export class ThermalPrinterProvider implements PrinterProvider {
  async print(cupom: FiscalCupomData): Promise<PrintResult> {
    if (!PRINTER_INTERFACE) return { ok: false, error: 'FISCAL_PRINTER_INTERFACE not configured' }

    try {
      const printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: PRINTER_INTERFACE,
        characterSet: CharacterSet.PC860_PORTUGUESE,
      })

      printer.alignCenter()
      printer.println(buildFiscalCupomText(cupom))
      if (cupom.qrCodeUrl) {
        printer.printQR(cupom.qrCodeUrl)
      }
      printer.cut()

      const success = await printer.execute()
      if (!success) return { ok: false, error: 'Printer did not acknowledge the job' }
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Print failed' }
    }
  }
}
