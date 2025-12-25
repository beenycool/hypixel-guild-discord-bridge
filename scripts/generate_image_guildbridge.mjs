import fs from 'fs'
import MessageToImage from '../src/instance/discord/common/message-to-image.ts'

(async () => {
  try {
    const message = '§bGuild > §b[MVP+] DuckySoSkilled §2[Staff]§f: §aHello §bworld §r{skin}'
    const username = 'DuckySoSkilled'

    const m = new MessageToImage({})
    const buffer = m.generateMessageImageSync(message, { username })

    const out = new URL('./guildbridge.png', import.meta.url)
    fs.writeFileSync(out.pathname, buffer)
    console.log('guildbridge.png written', out.pathname)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
})()
