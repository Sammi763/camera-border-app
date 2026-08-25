/**
 * electron-builder afterPack 钩子：在 .app 打包完成、DMG 制作之前做 ad-hoc 签名。
 *
 * 签名策略（本机真实验证结论）：
 * 1. 嵌套代码（Frameworks 下的 framework/helper）先签、外层最后签；
 * 2. 绝不重签 Resources/java-runtime——Temurin JRE 二进制带有原始
 *    hardened-runtime 签名，覆盖为 ad-hoc 会触发内核 SIGKILL，
 *    只签外层 bundle 即可通过校验且随包 Java 可正常运行；
 * 3. 正式对外分发时替换为开发者证书签名 + 公证（docs/release-checklist.md）。
 */
const { execSync } = require("node:child_process")
const path = require("node:path")

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") {
    return
  }
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  const contents = path.join(appPath, "Contents")

  const run = (cmd) => execSync(cmd, { stdio: "inherit" })

  // 1) 深度优先签署嵌套 framework / helper app（跳过随包 JRE）。
  //    嵌套项内部可能还有未签名的子组件（如 chrome_crashpad_handler），
  //    因此嵌套层使用 --deep；外层与 java-runtime 不受影响。
  const nested = execSync(
    `find "${contents}" -depth -type d \\( -name "*.framework" -o -name "*.app" \\) ! -path "*java-runtime*"`
  ).toString().trim().split("\n").filter(Boolean)

  for (const item of nested) {
    console.log(`[afterPack] ad-hoc 签名（嵌套）：${path.relative(appPath, item)}`)
    run(`codesign --force --deep -s - "${item}"`)
  }

  // 2) 外层 bundle 最后签（保留 java-runtime 原始签名）
  console.log(`[afterPack] ad-hoc 签名（外层）：${appPath}`)
  run(`codesign --force -s - "${appPath}"`)
}
