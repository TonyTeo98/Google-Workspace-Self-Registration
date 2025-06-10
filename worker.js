addEventListener('fetch', event => {
  event.respondWith(handleRequest(event))
})

/**
 * 路由和处理传入的请求
 * @param {Request} request
 */
async function handleRequest(request) {
  const url = new URL(request.url)

  // 新增：API 端点，用于获取统计数据
  if (url.pathname === '/api/stats' && request.method === 'GET') {
    return handleStatsRequest({ kv: REG_DATA })
  }

  // 修改：处理注册页面的 GET 和 POST 请求
  if (url.pathname === '/') {
    if (request.method === 'GET') {
      return serveRegistrationForm()
    } else if (request.method === 'POST') {
      return handleRegistration(request, { kv: REG_DATA })
    }
  }

  // 对于其他所有路径和方法，返回 404 Not Found 或 405 Method Not Allowed
  return new Response('Not Found', { status: 404 })
}


/**
 * 【新增】处理统计数据请求的函数
 * @param {object} env - 环境对象
 * @param {KVNamespace} env.kv - 绑定的 KV 命名空间
 */
async function handleStatsRequest({ kv }) {
  const countKey = 'registered_users_count'
  const limit = parseInt(REGISTRATION_LIMIT, 10) || 100;
  let currentCount = await kv.get(countKey);
  currentCount = currentCount ? parseInt(currentCount, 10) : 0;

  const stats = {
    registered: currentCount,
    limit: limit,
  };

  return new Response(JSON.stringify(stats), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // 允许跨域访问，如果你的前端和 worker 不同源
    },
  });
}


/**
 * 提供注册表单的 HTML，并集成 Cloudflare Turnstile 验证码
 */
function serveRegistrationForm() {
  const emailDomain = EMAIL_DOMAIN
  // HTML 代码与之前版本相同，但我们在 <body> 的末尾增加了一个 <script> 标签
  const html = `
  <!DOCTYPE html>
  <html>
    <head>
      <title>KTSU University 邮箱注册</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
      <style>
        /* CSS 样式部分保持不变，此处省略以节省篇幅 */
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f7f7f7; margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .container { background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); max-width: 400px; width: 100%; box-sizing: border-box; }
        h2 { text-align: center; color: #333; font-size: 24px; margin-bottom: 10px; }
        form { display: flex; flex-direction: column; }
        label { font-size: 14px; color: #555; margin-bottom: 6px; }
        input[type="text"], input[type="email"], input[type="password"] { width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; transition: border 0.3s ease; }
        input[type="text"]:focus, input[type="email"]:focus, input[type="password"]:focus { border-color: #4CAF50; outline: none; }
        input[type="submit"] { width: 100%; padding: 12px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; margin-top: 15px; transition: background-color 0.3s ease; }
        input[type="submit"]:hover { background-color: #45a049; }
        small { font-size: 12px; color: #777; }
        /* 新增：统计信息样式 */
        #stats { text-align: center; color: #666; font-size: 14px; margin-bottom: 20px; }
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
          
          fetch('/api/stats')
            .then(response => response.json())
            .then(data => {
              if (data.registered >= data.limit) {
                statsElement.textContent = '非常抱歉，注册名额已满！';
                statsElement.style.color = 'red';
                // 可选：禁用提交按钮
                document.querySelector('input[type="submit"]').disabled = true;
              } else {
                statsElement.textContent = \`当前名额: \${data.registered} / \${data.limit}\`;
              }
            })
            .catch(error => {
              console.error('无法获取名额信息:', error);
              statsElement.textContent = '无法加载名额信息，请稍后重试。';
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

// handleRegistration, getAccessToken, escapeHtml, validateEmail, verifyTurnstile 函数保持不变
// 此处省略这些函数的代码，因为它们和上一版本完全相同

/**
 * 处理注册表单提交，并验证 Cloudflare Turnstile 图形验证码
 * @param {Request} request
 * @param {object} env - 环境对象，包含绑定的服务
 * @param {KVNamespace} env.kv - 绑定的 KV 命名空间
 */
async function handleRegistration(request, { kv }) {
  const formData = await request.formData()
  const firstName = formData.get('firstName')
  const lastName = formData.get('lastName')
  const username = formData.get('username')
  const password = formData.get('password')
  const recoveryEmail = formData.get('recoveryEmail')
  const verificationCode = formData.get('verificationCode')
  const captchaToken = formData.get('cf-turnstile-response') // 获取 Turnstile Token

  // 1. 先校验图形验证码
  const isHuman = await verifyTurnstile(captchaToken)
  if (!isHuman) {
    return new Response('图形验证码校验失败，请重试。', { status: 400 })
  }

  // 2. 验证输入
  if (!firstName || !lastName || !username || !password || !recoveryEmail || !verificationCode) {
    return new Response('所有字段都是必填的。', { status: 400 })
  }

  // 验证恢复邮箱格式
  if (!validateEmail(recoveryEmail)) {
    return new Response('恢复邮箱格式不正确。', { status: 400 })
  }

  // 验证验证码
  if (verificationCode !== VERIFICATION_CODE) {
    return new Response('验证码错误。', { status: 400 })
  }

  // 检查注册名额限制
  const countKey = 'registered_users_count'
  const limit = parseInt(REGISTRATION_LIMIT, 10) || 100 // 默认上限 100
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
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(user),
    })

    if (response.ok) {
      await kv.put(countKey, (currentCount + 1).toString())
      
      const redirectHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>注册成功</title>
            <meta http-equiv="refresh" content="3;url=https://accounts.google.com/ServiceLogin?Email=${encodeURIComponent(email)}&continue=https://mail.google.com/mail/">
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f7f7f7; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
              .message { background-color: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); text-align: center; }
            </style>
          </head>
          <body>
            <div class="message">
              <h2>注册成功！</h2>
              <p>用户 <strong>${escapeHtml(email)}</strong> 已成功创建。</p>
              <p>正在跳转到谷歌登录页面...</p>
            </div>
          </body>
        </html>`
      return new Response(redirectHtml, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } })
    } else {
      const error = await response.json()
      return new Response(`注册失败: ${error.error.message}`, { status: 500 })
    }
  } catch (error) {
    return new Response(`内部错误: ${error.message}`, { status: 500 })
  }
}

async function getAccessToken() {
  const clientId = GOOGLE_CLIENT_ID
  const clientSecret = GOOGLE_CLIENT_SECRET
  const refreshToken = GOOGLE_REFRESH_TOKEN
  const tokenEndpoint = 'https://oauth2.googleapis.com/token'
  const params = new URLSearchParams()
  params.append('client_id', clientId)
  params.append('client_secret', clientSecret)
  params.append('refresh_token', refreshToken)
  params.append('grant_type', 'refresh_token')
  const tokenResponse = await fetch(tokenEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params })
  if (!tokenResponse.ok) { const error = await tokenResponse.text(); throw new Error(`无法获取访问令牌: ${error}`) }
  const tokenData = await tokenResponse.json(); return tokenData.access_token
}

function escapeHtml(unsafe) { return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;") }
function validateEmail(email) { const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; return re.test(email) }

async function verifyTurnstile(token) {
  const secretKey = TURNSTILE_SECRET_KEY
  if (!token) return false
  const url = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
  const body = new URLSearchParams()
  body.append("secret", secretKey)
  body.append("response", token)
  try {
    const resp = await fetch(url, { method: "POST", body })
    const data = await resp.json()
    return data.success === true
  } catch (err) { return false }
}
