# Privacy Policy

**Effective date:** October 8, 2026

Scratchpad ("Scratchpad", "we", "us") is a web app that helps you practise data structures and algorithms. You paste your pseudo-code and reasoning, or photograph your notebook, and Scratchpad traces it step by step, shows where your approach breaks, and gives hints. It is available at [https://dsa-scratchpad.vercel.app](https://dsa-scratchpad.vercel.app).

This policy explains what information Scratchpad collects, why, who it is shared with, and the choices you have. By creating an account or using Scratchpad, you agree to it. If you do not agree, please do not use the service.

## 1. Information we collect

### Information you give us

- **Account details.** Your name and email address, and a password if you sign up with email. Passwords are never stored in readable form; we keep only a salted hash (bcrypt).
- **Your work.** The problems you add (title, description, an optional link), the pseudo-code, reasoning and notes you submit, photos of notebook pages you upload, and your conversations with the built-in tutor chat.
- **Profile photo.** An image you choose to upload, which your browser crops and shrinks before it is sent.
- **Preferences.** Your preferred programming language and the AI provider and model you choose.
- **AI provider credentials.** The API key you supply, or the key issued to you when you connect with OpenRouter. Keys are encrypted with AES-256-GCM before they are stored, only the last four characters are kept in readable form so you can recognise the key, and a key is decrypted on our server only to make a request you started.

### Information from Google

If you choose **Continue with Google**, Google sends us your name, email address, profile picture URL, and Google account identifier (the `sub` value). We request only the `openid`, `email` and `profile` scopes. We never receive your Google password, and we do not access your Gmail, Drive, Calendar, Contacts or any other Google data.

### Information collected automatically

- **Cookies for sign-in.** See [Cookies and local storage](#6-cookies-and-local-storage).
- **Technical logs.** Our hosting provider and servers may record standard request information such as IP address, browser type, requested page and time, for security, abuse prevention and debugging.

## 2. How we use your information

We use your information to:

- create and secure your account, verify your email address, and send you sign-in and password-reset codes;
- run the features you ask for, including analysing your attempts, generating hints, walkthroughs and worked solutions, answering your chat messages, and reading your notebook photos;
- remember your settings;
- protect the service against abuse, fraud and security incidents, including rate limiting;
- diagnose problems and improve Scratchpad.

We do not sell your personal information. We do not use it for advertising, and we do not use it to train AI models.

## 3. Google user data

Scratchpad's use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including its Limited Use requirements.

- We use your Google name, email address and profile picture only to create your account, sign you in, and show your name and avatar inside Scratchpad.
- We do not transfer Google user data to anyone except as needed to provide these features, to comply with law, or as part of a merger or sale of the service with your notice.
- We do not use Google user data for advertising, and we do not allow people to read it except with your consent, for security purposes, or where the law requires.
- We do not use Google user data to train AI or machine-learning models.

You can stop using Google sign-in at any time and revoke Scratchpad's access from your [Google Account permissions page](https://myaccount.google.com/permissions).

## 4. Who we share information with

Scratchpad relies on a few service providers to work. They receive only what each job needs.

- **The AI provider you choose** (for example OpenAI, Anthropic, Google, xAI, DeepSeek, Mistral, Groq, Together AI, or OpenRouter). To produce a result, we send your problem, your attempt and notes, your chat messages, and any notebook photo to the provider and model you selected, using your own key. How that provider handles the data is governed by your agreement with them and their privacy policy. Please choose a provider you are comfortable with and do not submit anything you would not want to share with it.
- **OpenRouter**, only if you choose to connect through it. You are sent to OpenRouter to approve access, and it returns a key to Scratchpad.
- **Hosting and database providers.** The app runs on Vercel, and account and content data is stored in a MongoDB database.
- **Cloudflare R2**, which stores the notebook photos and profile photo you upload.
- **Email delivery.** We send verification and password-reset emails over SMTP (currently through Gmail), so your email address and the message pass through that service.
- **Reference lookups.** To give the AI a known solution for comparison, Scratchpad may fetch public pages for a problem you added: the problem link you provide, the public [doocs/leetcode](https://github.com/doocs/leetcode) repository on GitHub, or a web search through Tavily. A search sends only the problem title, the website name and the programming language, not your name, email or your own work.
- **Legal and safety.** We may disclose information if required by law, or to protect the rights, safety and security of our users, the public or the service.
- **Business transfers.** If Scratchpad is ever merged, acquired or sold, your information may transfer to the new owner, who must honour this policy.

## 5. How long we keep information

- Your account and content stay until you ask us to delete them (see [Your choices and rights](#8-your-choices-and-rights)).
- Sign-in sessions expire automatically (7 days after last use by default) and are removed from our database once expired.
- Email verification and password-reset codes expire after 10 minutes and are deleted shortly afterwards.
- When you replace a profile photo, the previous one is deleted. When you delete a problem, its attempts, solutions and messages are deleted with it.
- Backups and logs may keep copies for a short additional period before they are overwritten.

## 6. Cookies and local storage

Scratchpad uses only the cookies it needs to work. We do not use advertising or analytics cookies.

| Name | Purpose | Lifetime |
| --- | --- | --- |
| `dsab_at` | Keeps you signed in (short-lived access token) | 15 minutes |
| `dsab_rt` | Renews your session (refresh token), sent only to sign-in routes | 7 days, renewed on use |
| `dsab_g_state`, `dsab_g_verifier`, `dsab_g_next` | Protect the Google sign-in round trip | 10 minutes |

All of these are `HttpOnly`, `SameSite=Lax`, and `Secure` in production. Your theme choice (light or dark) is saved in your browser's local storage and never sent to us.

## 7. Security

We protect your information with encryption in transit (HTTPS), hashed passwords, encrypted API keys, short-lived sessions, origin checks on requests that change data, rate limiting, and by restricting every query to the signed-in account. Code that the AI generates to trace your approach runs in an isolated sandbox. No system is perfectly secure, so we cannot guarantee absolute security, and you should keep your password and API keys safe.

## 8. Your choices and rights

You can:

- view and update your name, profile photo, language, and AI provider from **Settings** and **Profile**;
- remove or replace your AI key at any time;
- delete individual problems and the content stored with them;
- ask us to access, correct, export, or delete your account and everything stored with it by emailing us at the address below. We will act on verified requests within 30 days.

Depending on where you live (for example, the EU, UK or California), you may have additional legal rights, such as the right to object to or restrict certain processing or to lodge a complaint with a data protection authority. We will honour those rights as the law requires.

## 9. Children

Scratchpad is not directed to children under 13, and we do not knowingly collect their personal information. If you believe a child has given us personal information, contact us and we will delete it.

## 10. International transfers

Our providers may process data in countries other than your own, including the United States. By using Scratchpad, you understand your information may be transferred to and processed in those countries, with the protections described here.

## 11. Changes to this policy

We may update this policy as Scratchpad changes. When we do, we will change the effective date above, and for significant changes we will tell you in the app or by email. Continuing to use Scratchpad after a change means you accept the updated policy.

## 12. Contact us

Questions, requests or concerns about privacy? Email [naeemhasan28@gmail.com](mailto:naeemhasan28@gmail.com).
