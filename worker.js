/**
 * Cloudflare Worker for self-service Google Workspace account registration
 * Author: Gemini AI
 * Version: 1.4 (Final)
 *
 * Features:
 * - User registration form
 * - Google Admin SDK integration to create users
 * - Registration limit via Cloudflare KV
 * - Real-time registration stats on the frontend
 * - Cloudflare Turnstile for bot protection
 * - Robust routing to prevent common errors
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event))
})

/**
 * 路由和处理传入的请求 (健壮版本)
 * @param {Request} request
 */
async function handleRequest(request) {
  const url = new URL(request.url)

  // 1. 优先处理 favicon.ico 请求，直接返回 204 No Content
  if (url.pathname === '/favicon.ico') {
    return new Response(null, { status: 204 })
  }

  // 2. 处理 API 统计数据请求
  if (url.pathname === '/api/stats') {
    if (request.method === 'GET') {
      return handleStatsRequest({ kv: REG_DATA })
    } else {
      return new Response('Method Not Allowed', { status: 405 })
    }
  }

  // 3. 处理根路径的请求 (注册页面)
  if (url.pathname === '/') {
    if (request.method === 'GET') {
      return serveRegistrationForm()
    } else if (request.method === 'POST') {
      return handleRegistration(request, { kv: REG_DATA })
    } else {
      return new Response('Method Not Allowed', { status: 405 })
    }
  }

  // 4. 如果以上所有路径都不匹配，返回 404 Not Found
  return new Response('Not Found', { status: 404 })
}


/**
 * 处理统计数据请求的函数
 * @param {object} env - 环境对象
 * @param {KVNamespace} env.kv - 绑定的 KV 命名空间
 */
async function handleStatsRequest({ kv }) {
  const countKey = 'registered_users_count'
  const limit = parseInt(REGISTRATION_LIMIT, 10) || 100
  let currentCount = await kv.get(countKey)
  currentCount = currentCount ? parseInt(currentCount, 10) : 0

  const stats = {
    registered: currentCount,
    limit: limit,
  }

  return new Response(JSON.stringify(stats), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // 允许跨域，以防万一
    },
  })
}


/**
 * 提供注册表单的 HTML，并集成实时统计和 Turnstile
 */
function serveRegistrationForm() {
  const emailDomain = EMAIL_DOMAIN
  const html = `
  <!DOCTYPE html>
  <html>
    <head>
      <title>KTSU University 邮箱注册</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f7f7f7; margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .container { background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); max-width: 400px; width: 100%; box-sizing: border-box; }
        h2 { text-align: center; color: #333; font-size: 24px; margin-bottom: 10px; }
        form { display: flex; flex-direction: column; }
        label { font-size: 14px; color: #555; margin-bottom: 6px; }
        input[type="text"], input[type="email"], input[type="password"] { width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; transition: border 0.3s ease; }
        input[type="text"]:focus, input[type="email"]:focus, input[type="password"]:focus { border-color: #4CAF50; outline: none; }
        input[type="submit"] { width: 100%; padding: 12px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; margin-top: 15px; transition: background-color 0.3s ease; }
        input[type="submit"]:hover { background-color: #45a049; }
        input[type="submit"]:disabled { background-color: #cccccc; cursor: not-allowed; }
        small { font-size: 12px; color: #777; }
        #stats { text-align: center; color: #666; font-size: 14px; margin-bottom: 20px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>KTSU University 邮箱注册</h2>
        <p id="stats">正在加载名额信息...</p>
        
        <form action="/" method="POST">
          <label for="firstName">名字:</label>
          <input type="text" id="firstName" name="firstName" required>
          
          <label for="lastName">姓氏:</label>
          <input type="text" id="lastName" name="lastName" required>
          
          <label for="username">用户名:</label>
          <input type="text" id="username" name="username" required>
          <small>邮箱后缀将自动添加为 <strong>${escapeHtml(emailDomain)}</strong></small><br><br>

          <label for="password">密码:</label>
          <input type="password" id="password" name="password" required>

          <label for="recoveryEmail">恢复邮箱:</label>
          <input type="email" id="recoveryEmail" name="recoveryEmail" required>

          <label for="verificationCode">验证码:</label>
          <input type="text" id="verificationCode" name="verificationCode" required>

          <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}"></div>

          <input type="submit" value="注册">
        </form>
      </div>

      <script>
        document.addEventListener('DOMContentLoaded', () => {
          const statsElement = document.getElementById('stats');
          const submitButton = document.querySelector('input[type="submit"]');
          
          fetch('/api/stats')
            .then(response => response.json())
            .then(data => {
              if (data.registered >= data.limit) {
                statsElement.textContent = '非常抱歉，注册名额已满！';
                statsElement.style.color = 'red';
                submitButton.disabled = true;
              } else {
                statsElement.textContent = \`当前名额: \${data.registered} / \${data.limit}\`;
              }
            })
            .catch(error => {
              console.error('无法获取名额信息:', error);
              statsElement.textContent = '无法加载名额信息，请稍后重试。';
              statsElement.style.color = 'orange';
            });
        });
      </script>
    </body>
  </html>
  `
  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  })
}


/**
 * 处理注册表单提交
 * @param {Request} request
 * @param {object} env
 * @param {KVNamespace} env.kv
 */
async function handleRegistration(request, { kv }) {
  const formData = await request.formData()
  const firstName = formData.get('firstName')
  const lastName = formData.get('lastName')
  const username = formData.get('username')
  const password = formData.get('password')
  const recoveryEmail = formData.get('recoveryEmail')
  const verificationCode = formData.get('verificationCode')
  const captchaToken = formData.get('cf-turnstile-response')

  const isHuman = await verifyTurnstile(captchaToken)
  if (!isHuman) {
    return new Response('机器人验证失败，请刷新重试。', { status: 403 })
  }

  if (!firstName || !lastName || !username || !password || !recoveryEmail || !verificationCode) {
    return new Response('所有字段都是必填的。', { status: 400 })
  }

  if (!validateEmail(recoveryEmail)) {
    return new Response('恢复邮箱格式不正确。', { status: 400 })
  }

  if (verificationCode !== VERIFICATION_CODE) {
    return new Response('验证码错误。', { status: 400 })
  }

  const countKey = 'registered_users_count'
  const limit = parseInt(REGISTRATION_LIMIT, 10) || 100
  let currentCount = await kv.get(countKey)
  currentCount = currentCount ? parseInt(currentCount, 10) : 0

  if (currentCount >= limit) {
    return new Response('非常抱歉，注册名额已满。感谢您的关注！', { status: 403 })
  }

  const email = `${username}${EMAIL_DOMAIN}`

  if (!email.endsWith(EMAIL_DOMAIN)) {
    return new Response(`邮箱后缀必须是 ${EMAIL_DOMAIN}。`, { status: 400 })
  }

  try {
    const accessToken = await getAccessToken()

    const user = {
      name: { givenName: firstName, familyName: lastName },
      password: password,
      primaryEmail: email,
      recoveryEmail: recoveryEmail,
    }

    const response = await fetch('https://admin.googleapis.com/admin/directory/v1/users', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    })

    if (response.ok) {
      await kv.put(countKey, (currentCount + 1).toString())
      
      const redirectHtml = `
        <!DOCTYPE html><html><head><title>注册成功</title>
        <meta http-equiv="refresh" content="3;url=https://accounts.google.com/ServiceLogin?Email=${encodeURIComponent(email)}&continue=https://mail.google.com/mail/">
        <style>body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f7f7f7;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;} .message{background-color:white;padding:20px;border-radius:10px;box-shadow:0 4px 10px rgba(0,0,0,0.1);text-align:center;}</style>
        </head><body><div class="message"><h2>注册成功！</h2><p>用户 <strong>${escapeHtml(email)}</strong> 已成功创建。</p><p>正在跳转到谷歌登录页面...</p></div></body></html>`
      return new Response(redirectHtml, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } })
    } else {
      const error = await response.json()
      return new Response(`注册失败: ${error.error.message}`, { status: response.status })
    }
  } catch (error) {
    return new Response(`内部错误: ${error.message}`, { status: 500 })
  }
}

/**
 * 获取 Google API 访问令牌
 */
async function getAccessToken() {
  const tokenEndpoint = 'https://oauth2.googleapis.com/token'
  const params = new URLSearchParams()
  params.append('client_id', GOOGLE_CLIENT_ID)
  params.append('client_secret', GOOGLE_CLIENT_SECRET)
  params.append('refresh_token', GOOGLE_REFRESH_TOKEN)
  params.append('grant_type', 'refresh_token')

  const tokenResponse = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text()
    throw new Error(`无法获取访问令牌: ${error}`)
  }

  const tokenData = await tokenResponse.json()
  return tokenData.access_token
}

/**
 * 转义 HTML 特殊字符，防止 XSS 攻击
 * @param {string} unsafe
 */
function escapeHtml(unsafe) {
  return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
}

/**
 * 验证邮箱格式
 * @param {string} email
 */
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(String(email).toLowerCase())
}

/**
 * 验证 Cloudflare Turnstile 验证码
 * @param {string} token
 */
async function verifyTurnstile(token) {
  if (!token) return false
  
  const url = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
  const body = new URLSearchParams()
  body.append("secret", TURNSTILE_SECRET_KEY)
  body.append("response", token)

  try {
    const resp = await fetch(url, { method: "POST", body })
    const data = await resp.json()
    return data.success === true
  } catch (err) {
    console.error("Turnstile verification failed:", err)
    return false
  }
}

/**
 * ===================================================================================
 * |                           !!! 配置要求 (非常重要) !!!                             |
 * ===================================================================================
 * * Worker 正常运行需要配置以下环境变量 (Secrets):
 * -----------------------------------------------------------------------------------
 * - GOOGLE_CLIENT_ID      : Google Cloud 项目的 OAuth 2.0 客户端 ID。
 * - GOOGLE_CLIENT_SECRET  : Google Cloud 项目的客户端密钥。
 * - GOOGLE_REFRESH_TOKEN  : 用于获取访问令牌的刷新令牌。
 * - VERIFICATION_CODE     : 一个自定义的邀请码/验证码，防止无关人员注册。
 * - EMAIL_DOMAIN          : 您的 Google Workspace 域名 (例如: @example.com)。
 * - REGISTRATION_LIMIT    : 注册名额总数上限 (例如: 200)。
 * - TURNSTILE_SITE_KEY    : Cloudflare Turnstile 的站点密钥 (Site Key)。
 * - TURNSTILE_SECRET_KEY  : Cloudflare Turnstile 的秘密密钥 (Secret Key)。
 * * * Worker 还需要绑定一个 KV 命名空间:
 * -----------------------------------------------------------------------------------
 * 1. 在 Cloudflare 后台创建 KV 命名空间 (例如: REGISTRATION_DATA)。
 * 2. 在 Worker 的设置中，将此 KV 命名空间绑定到变量。
 * - 变量名称 (Variable name): REG_DATA
 * - KV 命名空间 (KV namespace): (选择您创建的命名空间)
 * 3. 【首次部署时】需要手动在 KV 中初始化计数值:
 * - Key: registered_users_count
 * - Value: 0
 * */
