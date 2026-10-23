// gen_license_keys.mjs — 生成道一-易经 商业授权 Ed25519 密钥对 + 离线激活码签名工具
// ============================================================================
// 用法：
//   生成密钥对（仅一次）：        node scripts/gen_license_keys.mjs gen
//   签一张离线激活码：            node scripts/gen_license_keys.mjs sign --tier full --plan monthly --days 30
//   签一张免费注册码(DR)：        node scripts/gen_license_keys.mjs sign --tier free --reg --plan free_reg --days 36500
//   验一张码（用公钥）：          node scripts/gen_license_keys.mjs verify --code <CODE> --pub <PEM>
//
// 安全约束（§6.6）：
//   · 私钥**仅作者持有**，绝不入库、绝不进 npm 包；落入仓库即视为泄露需轮换。
//   · 公钥放入插件配置 licensePublicKey / 文件 licensePubKeyPath / env DAOYI_LICENSE_PUBKEY。
//   · 离线码 = base64url(payload).base64url(ed25519签名)，签名对象=payload 原文。
// ============================================================================
import { generateKeyPairSync, createPublicKey, createPrivateKey, sign as ed25519Sign, verify as ed25519Verify } from 'node:crypto'
import { writeFileSync, readFileSync } from 'node:fs'

function b64url(buf) {
  return Buffer.from(buf).toString('base64url')
}

function gen() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' })
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' })
  writeFileSync('daoyi-license-private.pem', privPem)
  writeFileSync('daoyi-license-public.pem', pubPem)
  console.log('已生成：')
  console.log('  私钥 daoyi-license-private.pem  ← 务必离线保管，勿入库')
  console.log('  公钥 daoyi-license-public.pem  ← 其文本内容放入 licensePublicKey 配置')
  console.log('\n公钥内容（贴入配置）：')
  console.log(pubPem.trim())
}

function sign(argv) {
  const tier = argv.tier || 'full'
  const plan = argv.plan || tier
  const days = Number(argv.days) || 365
  const reg = argv.reg === true || argv.reg === 'true'
  const expiresAt = days > 0 ? Date.now() + days * 86400_000 : 0
  const payload = { tier, reg: reg && tier === 'free', plan, exp: expiresAt, nonce: Math.random().toString(36).slice(2), alg: 'ed25519' }
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const key = createPrivateKey(readFileSync('daoyi-license-private.pem'))
  const sig = ed25519Sign(null, Buffer.from(payloadB64, 'utf8'), key)
  const code = `${payloadB64}.${b64url(sig)}`
  console.log(`已签 ${tier}${reg ? '(注册)' : ''} / ${plan} / ${days}天：`)
  console.log(code)
}

function verify(argv) {
  const code = argv.code
  const pubPem = argv.pub ? readFileSync(argv.pub, 'utf8') : readFileSync('daoyi-license-public.pem', 'utf8')
  const [payloadB64, sigB64] = code.split('.')
  const pub = createPublicKey(pubPem)
  const ok = ed25519Verify(null, Buffer.from(payloadB64, 'utf8'), pub, Buffer.from(sigB64, 'base64url'))
  console.log('验签结果：', ok ? '通过' : '失败')
  if (ok) console.log('payload：', JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')))
}

// 极简参数解析
const argv = {}
for (let i = 3; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a.startsWith('--')) {
    const k = a.slice(2)
    const v = process.argv[i + 1]
    if (v && !v.startsWith('--')) {
      argv[k] = v
      i++
    } else argv[k] = true
  }
}

const cmd = process.argv[2]
if (cmd === 'gen') gen()
else if (cmd === 'sign') sign(argv)
else if (cmd === 'verify') verify(argv)
else {
  console.log('用法：')
  console.log('  node scripts/gen_license_keys.mjs gen')
  console.log('  node scripts/gen_license_keys.mjs sign --tier full|plus|free --plan monthly --days 30 [--reg]')
  console.log('  node scripts/gen_license_keys.mjs verify --code <CODE> --pub <pub.pem>')
}
