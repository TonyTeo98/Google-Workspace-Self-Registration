addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

/**
 * 处理传入的请求
 * @param {Request} request
 */
async function handleRequest(request) {
  if (request.method === 'GET') {
    return serveRegistrationForm()
  } else if (request.method === 'POST') {
    return handleRegistration(request)
  } else {
    return new Response('Method Not Allowed', { status: 405 })
  }
}

/**
 * 提供注册表单的 HTML，并集成 Cloudflare Turnstile 验证码
 */
function serveRegistrationForm() {
  const emailDomain = EMAIL_DOMAIN
  const html = `
  <!DOCTYPE html>
  <html>
    <head>
      <title>Spark University 邮箱注册</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">  <!-- 适配移动端的视口设置 -->
      <!-- 引入 Cloudflare Turnstile 的脚本 -->
      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f7f7f7;
          margin: 0;
          padding: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
        }

        .container {
          background-color: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
          max-width: 400px;
          width: 100%;
          box-sizing: border-box;
        }

        h2 {
          text-align: center;
          color: #333;
          font-size: 24px;
          margin-bottom: 20px;
        }

        form {
          display: flex;
          flex-direction: column;
        }

        label {
          font-size: 14px;
          color: #555;
          margin-bottom: 6px;
        }

        input[type="text"], input[type="email"], input[type="password"] {
          width: 100%;
          padding: 12px;
          margin: 8px 0;
          border: 1px solid #ddd;
          border-radius: 5px;
          box-sizing: border-box;
          transition: border 0.3s ease;
        }

        input[type="text"]:focus, input[type="email"]:focus, input[type="password"]:focus {
          border-color: #4CAF50;
          outline: none;
        }

        input[type="submit"] {
          width: 100%;
          padding: 12px;
          background-color: #4CAF50;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
          margin-top: 15px;
          transition: background-color 0.3s ease;
        }

        input[type="submit"]:hover {
          background-color: #45a049;
        }

        small {
          font-size: 12px;
          color: #777;
        }

        .footer {
          text-align: center;
          font-size: 14px;
          padding-top: 20px;
          color: #888;
        }

        .footer a {
          color: #4CAF50;
          text-decoration: none;
        }

        .footer a:hover {
          text-decoration: underline;
        }

        /* 响应式布局 */
        @media only screen and (max-width: 600px) {
          .container {
            padding: 20px;
            margin: 10px;
          }

          h2 {
            font-size: 20px;
          }

          input[type="text"], input[type="email"], input[type="password"] {
            padding: 10px;
            font-size: 14px;
          }

          input[type="submit"] {
            padding: 10px;
            font-size: 14px;
          }

          label {
            font-size: 12px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Saprk University 邮箱注册</h2>
        <form method="POST">
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

          <!-- Cloudflare Turnstile 验证组件 -->
          <div
            class="cf-turnstile"
            data-sitekey="${TURNSTILE_SITE_KEY}"
          ></div>

          <input type="submit" value="注册">
        </form>
      </div>
    </body>
  </html>
  `
  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  })
}

/**
 * 处理注册表单提交，并验证 Cloudflare Turnstile 图形验证码
 * @param {Request} request
 */
async function handleRegistration(request) {
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

  // 构建完整的邮箱地址
  const email = `${username}${EMAIL_DOMAIN}`

  // 验证邮箱后缀
  if (!email.endsWith(EMAIL_DOMAIN)) {
    return new Response(`邮箱后缀必须是 ${EMAIL_DOMAIN}。`, { status: 400 })
  }

  try {
    // 获取访问令牌
    const accessToken = await getAccessToken()

    // 创建用户对象
    const user = {
      name: {
        givenName: firstName,
        familyName: lastName,
      },
      password: password,
      primaryEmail: email,
      recoveryEmail: recoveryEmail,
    }

    // 调用 Google Admin SDK 创建用户
    const response = await fetch('https://admin.googleapis.com/admin/directory/v1/users', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(user),
    })

    if (response.ok) {
      // 注册成功后，自动重定向到谷歌登录页面并预填充邮箱
      const redirectHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>注册成功</title>
            <meta http-equiv="refresh" content="3;url=https://accounts.google.com/ServiceLogin?Email=${encodeURIComponent(email)}&continue=https://mail.google.com/mail/">
            <style>
              body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background-color: #f7f7f7;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
              }
              .message {
                background-color: white;
                padding: 20px;
                border-radius: 10px;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                text-align: center;
              }
            </style>
          </head>
          <body>
            <div class="message">
              <h2>注册成功！</h2>
              <p>用户 <strong>${escapeHtml(email)}</strong> 已成功创建。</p>
              <p>正在跳转到谷歌登录页面...</p>
            </div>
          </body>
        </html>
      `
      return new Response(redirectHtml, {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      })
    } else {
      const error = await response.json()
      return new Response(`注册失败: ${error.error.message}`, { status: 500 })
    }
  } catch (error) {
    return new Response(`内部错误: ${error.message}`, { status: 500 })
  }
}

/**
 * 获取 Google API 访问令牌
 */
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
 * @returns {string}
 */
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

/**
 * 验证邮箱格式
 * @param {string} email
 * @returns {boolean}
 */
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(email)
}

/**
 * 验证 Cloudflare Turnstile 验证码
 * @param {string} token - 前端提交的 Turnstile token
 * @returns {boolean} true 表示验证通过，否则验证失败
 */
async function verifyTurnstile(token) {
  // 替换为你在 Cloudflare Turnstile 后台获取的 Secret Key
  const secretKey = TURNSTILE_SECRET_KEY

  // 如果没有 token，则直接失败
  if (!token) {
    return false
  }

  const url = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
  const body = new URLSearchParams()
  body.append("secret", secretKey)
  body.append("response", token)

  try {
    const resp = await fetch(url, {
      method: "POST",
      body,
    })
    const data = await resp.json()
    // data: { success: boolean, ... }
    return data.success === true
  } catch (err) {
    // 如果校验过程发生任何异常，也认为失败
    return false
  }
}
/**
 * Worker 使用以下环境变量，确保在 Cloudflare 控制台中已配置：
 * - GOOGLE_CLIENT_ID 
 * - GOOGLE_CLIENT_SECRET
 * - GOOGLE_REFRESH_TOKEN
 * - GOOGLE_ADMIN_EMAIL
 * - VERIFICATION_CODE
 * - EMAIL_DOMAIN
 * - TURNSTILE_SITE_KEY
 * - TURNSTILE_SECRET_KEY
 */
