import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { url } = req.query

  if (!url || typeof url !== 'string') {
    return res.status(400).send('Missing URL parameter')
  }

  try {
    const response = await fetch(url)
    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch from remote source')
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', 'inline')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    // Crucially, we DO NOT set X-Frame-Options, allowing it to be embedded in iframes!

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    return res.status(200).send(buffer)
  } catch (error) {
    console.error('[Proxy] Fetch error:', error)
    return res.status(500).send('Internal Server Error')
  }
}
