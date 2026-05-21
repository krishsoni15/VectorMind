import { PDFParse } from 'pdf-parse'

async function run() {
  console.log('Testing PDFParse...')
  try {
    console.log('PDFParse is', PDFParse)
    const options = { data: new Uint8Array([0, 1, 2, 3]) }
    const parser = new PDFParse(options)
    console.log('Parser instance created successfully:', parser)
  } catch (err: any) {
    console.error('Error during test:', err)
  }
}

run()
