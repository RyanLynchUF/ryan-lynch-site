const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Ryan Lynch — Be Right Back</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap" rel="stylesheet" />
  <style>
    :root {
      --color-bg: #faf9f7;
      --color-text: #1c1917;
      --color-text-secondary: #57534e;
      --color-muted: #78716c;
      --color-accent-warm: #ea580c;
      --color-border: #e7e5e4;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --color-bg: #1c1917;
        --color-text: #e7e5e4;
        --color-text-secondary: #a8a29e;
        --color-muted: #a8a29e;
        --color-accent-warm: #fb923c;
        --color-border: #44403c;
      }
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: var(--color-text);
      background: var(--color-bg);
      line-height: 1.7;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem 1rem;
    }

    .container {
      max-width: 480px;
      text-align: center;
    }

    h1 {
      font-family: "DM Serif Display", Georgia, serif;
      font-size: 2rem;
      font-weight: 400;
      margin-bottom: 0.25rem;
    }

    .bar {
      width: 3rem;
      height: 3px;
      background: var(--color-accent-warm);
      border-radius: 2px;
      margin: 1rem auto;
    }

    p {
      color: var(--color-text-secondary);
      margin-bottom: 1rem;
    }

    .muted {
      color: var(--color-muted);
      font-size: 0.875rem;
    }

    a {
      color: var(--color-accent-warm);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Be Right Back</h1>
    <div class="bar"></div>
    <p>Sorry for the inconvenience. I self-host my site and haven't configured high availability. But, I'm always highly available if you want to <a href="https://www.linkedin.com/in/ryan-lynch-uf/">reach out via LinkedIn</a> in the meantime.</p>
  </div>
</body>
</html>`;

export default {
  async fetch(request) {
    try {
      const response = await fetch(request);

      if (response.status >= 500) {
        return new Response(MAINTENANCE_HTML, {
          status: 503,
          headers: {
            "Content-Type": "text/html;charset=utf-8",
            "Retry-After": "300",
            "Cache-Control": "no-store",
          },
        });
      }

      return response;
    } catch {
      return new Response(MAINTENANCE_HTML, {
        status: 503,
        headers: {
          "Content-Type": "text/html;charset=utf-8",
          "Retry-After": "300",
          "Cache-Control": "no-store",
        },
      });
    }
  },
};
