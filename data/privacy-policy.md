# Privacy Policy

**Effective date:** October 17, 2026

Scratchpad ("Scratchpad", "we", "us") is a web app that helps you practise data structures and algorithms. You paste your pseudo-code and reasoning, sketch your approach, or photograph your notebook, and Scratchpad traces it step by step, shows where your approach breaks, and gives hints. It is available at [https://dsa-scratchpad.vercel.app](https://dsa-scratchpad.vercel.app).

This policy explains what information Scratchpad collects, why, who it is shared with, and the choices you have. By creating an account or using Scratchpad, you agree to it. If you do not agree, please do not use the service.

## 1. Information we collect

### Information you give us

- **Account details.** Your name and email address, and a password if you sign up with email. Passwords are never stored in readable form; we keep only a salted hash (bcrypt).
- **Your work.** The problems you add (title, description, an optional link), the pseudo-code, reasoning and notes you submit, photos of notebook pages you upload, and your conversations with the built-in tutor chat.
- **Sketches and pictures.** The sketch canvas you draw on for a problem (its shapes, values, pointers, text and freehand marks), which we store with the problem, and any pictures (PNG, JPG or WebP) you add to your personal image library.
- **Profile photo.** An image you choose to upload, which your browser crops and shrinks before it is sent.
- **Preferences.** Your preferred programming language, the AI provider and model you choose (including a separate model for reading images, if you set one), and display choices such as the chat layout, the problems list view and the sketch grid. We also remember which first-run tours you have seen.
- **AI provider and search credentials.** The API keys you supply, the key issued to you when you connect with OpenRouter, and your Tavily API key if you turn on web search. You can save several keys per provider and give each a label and a note of your own. Keys are encrypted with AES-256-GCM before they are stored, only the last four characters are kept in readable form so you can recognise the key, and a key is decrypted on our server only to make a request you started. Deleting a saved key removes it from our database.

### Information we create for you

- **Problem details from your link.** When you add a link to a problem, we fetch the page and keep the text we find (and a short list of known solutions, see [Who we share information with](#4-who-we-share-information-with)) with the problem so the AI can use it.
- **Test cases and checks.** For each problem, the AI you chose generates tags, a set of fixed test cases, and a reference solution used only to check answers. They are stored with the problem. The reference solution is never shown to you or to anyone you share with.
- **Analyses and solutions.** The step-by-step walkthroughs, diagnoses, hints and worked solutions produced for your attempts, including how many AI tokens each run used.
- **Activity.** The activity calendar and streaks on your profile are worked out from the dates of your own attempts. Your browser sends its time zone so that a day ends where yours does; we do not store it.

### Information from Google

If you choose **Continue with Google**, Google sends us your name, email address, profile picture URL, and Google account identifier (the `sub` value). We request only the `openid`, `email` and `profile` scopes. We never receive your Google password, and we do not access your Gmail, Drive, Calendar, Contacts or any other Google data.

### Information collected automatically

- **Cookies for sign-in.** See [Cookies and local storage](#6-cookies-and-local-storage).
- **Time zone.** When the profile page loads your activity calendar, your browser sends its time zone name. It is used for that request only.
- **Technical logs.** Our hosting provider and servers may record standard request information such as IP address, browser type, requested page and time, for security, abuse prevention and debugging.

## 2. How we use your information

We use your information to:

- create and secure your account, verify your email address, and send you sign-in and password-reset codes;
- run the features you ask for, including reading the statement from a problem link, building test cases, analysing your attempts, generating hints, walkthroughs and worked solutions, answering your chat messages, and reading your notebook photos and sketches;
- show your activity calendar and streaks;
- let you share an attempt or solution by link, if you choose to (see [Who we share information with](#4-who-we-share-information-with));
- remember your settings;
- protect the service against abuse, fraud and security incidents, including rate limiting;
- diagnose problems and improve Scratchpad.

We do not sell your personal information. We do not use it for advertising, and we do not use it to train AI models.

**Operator access.** People who run Scratchpad and have the admin role can open an admin page. It shows platform-wide totals (users, problems, attempts, solutions, failed runs and AI tokens used) and a list of accounts with each person's name, email address, role, sign-up date, last activity, whether they have verified their email and finished setup, and how many problems, attempts, solutions and tokens they have. It does not list your problems, attempts or chats. Admins can also promote or demote other accounts.

## 3. Google user data

Scratchpad's use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including its Limited Use requirements.

- We use your Google name, email address and profile picture only to create your account, sign you in, and show your name and avatar inside Scratchpad.
- We do not transfer Google user data to anyone except as needed to provide these features, to comply with law, or as part of a merger or sale of the service with your notice.
- We do not use Google user data for advertising, and we do not allow people to read it except with your consent, for security purposes, or where the law requires.
- We do not use Google user data to train AI or machine-learning models.

You can stop using Google sign-in at any time and revoke Scratchpad's access from your [Google Account permissions page](https://myaccount.google.com/permissions).

## 4. Who we share information with

Scratchpad relies on a few service providers to work. They receive only what each job needs.

- **The AI provider you choose** (for example OpenAI, Anthropic, Google, xAI, DeepSeek, Mistral, Groq, Together AI, or OpenRouter). To produce a result, we send your problem (with the text of any page you linked), your attempt and notes, your chat messages, and any notebook photo to the provider and model you selected, using your own key. When you use **Draft an attempt** on the sketch canvas, we send a PNG picture of your sketch and a text list of its elements to your chosen vision model. How that provider handles the data is governed by your agreement with them and their privacy policy. Please choose a provider you are comfortable with and do not submit anything you would not want to share with it.
- **OpenRouter**, only if you choose to connect through it. You are sent to OpenRouter to approve access, and it returns a key to Scratchpad.
- **Hosting and database providers.** The app runs on Vercel, and account and content data is stored in a MongoDB database.
- **Cloudinary**, which stores the files you upload or that Scratchpad makes for you: notebook photos, your profile photo, pictures in your image library, pictures made from your sketches, and the visualization files (JSON) behind your walkthroughs and solutions. They are stored as private files that can only be opened through signed links.
- **Email delivery.** We send verification and password-reset emails over SMTP (currently through Gmail), so your email address and the message pass through that service.
- **Websites you link.** When you enter a problem link, our server fetches that page, both to show you a preview of the statement before the problem exists and to keep its text with the problem. Depending on the address this is LeetCode, Codeforces, AtCoder, GeeksforGeeks, CodeChef, Naukri Code360 (Coding Ninjas), HackerRank, or any other public web page. The site sees a request from our server for the problem named in your link, not your name, email or account. We also ask LeetCode for a LeetCode problem's function signature when we build its test cases.
- **Reference lookups.** To give the AI a known solution for comparison, Scratchpad may fetch the public [doocs/leetcode](https://github.com/doocs/leetcode) repository on GitHub for a LeetCode problem or, if you turned on web search, run a search through Tavily made with your own Tavily API key (so it counts against your Tavily account). A search sends only the problem title, the website name and the programming language, not your name, email or your own work.
- **jsDelivr, when you use the Playground.** The Playground runs your code in your own browser, and nothing from a run is sent to us or saved. To run Python, your browser downloads the Pyodide runtime from `cdn.jsdelivr.net`, so jsDelivr can see your IP address and browser details, as with any file loaded from a content delivery network.
- **Anyone with a link you share.** Nothing is public unless you choose it. You can make a single finished attempt or a single solution version public, and Scratchpad gives you a link with a random token. Anyone who has the link can open it, signed in or not, and the page asks search engines not to index it. A shared attempt shows the problem's title, statement, tags and link, your pseudo-code and explanation, and the walkthrough. A shared solution shows the same problem details, the worked solution, its walkthrough, and the language and AI model used. Shared pages never show your chat, the text we fetched from the problem's website, the text of known solutions we looked up (a solution credits its sources by name and link), your notebook photos, sketches, usage, or your name and email. A visitor can **fork** the problem, which copies the problem's statement, link, tags, fetched text and known solutions into their own account. It copies none of your attempts, solutions or chats. You can stop sharing at any time: unsharing deletes the link for good, and sharing again creates a new one. Copies that someone already made by forking stay in their account.
- **Legal and safety.** We may disclose information if required by law, or to protect the rights, safety and security of our users, the public or the service.
- **Business transfers.** If Scratchpad is ever merged, acquired or sold, your information may transfer to the new owner, who must honour this policy.

## 5. How long we keep information

- Your account and content stay until you ask us to delete them (see [Your choices and rights](#8-your-choices-and-rights)).
- Sign-in sessions expire automatically (7 days after last use by default) and are removed from our database once expired.
- Email verification and password-reset codes expire after 10 minutes and are deleted shortly afterwards.
- When you replace a profile photo, the previous one is deleted.
- When you delete a problem, its attempts, solutions, chat messages, sketch, share links, fetched page text, test cases and the files stored for them (notebook photos and visualization files) are deleted with it. Deleting a single attempt or solution removes its chat, its share link and its files in the same way.
- Pictures in your image library are separate from any one problem and stay until you delete them. Deleting one removes the file; sketches that used it show a placeholder instead.
- Unsharing a link deletes it at once. Copies made by someone who forked the problem before then stay in their account.
- Deleting a saved API key removes it. If it was the key in use, Scratchpad stops using it.
- Stored files are removed right after the database records. If that cleanup fails, a file can linger unseen for a while, since only signed links can open it.
- Backups and logs may keep copies for a short additional period before they are overwritten.

## 6. Cookies and local storage

Scratchpad uses only the cookies it needs to work. We do not use advertising or analytics cookies.

| Name | Purpose | Lifetime |
| --- | --- | --- |
| `dsab_at` | Keeps you signed in (short-lived access token) | 15 minutes |
| `dsab_rt` | Renews your session (refresh token), sent only to sign-in routes | 7 days, renewed on use |
| `dsab_s` | A marker (it holds no secret) that tells us a returning visitor had a session, so we can renew it on pages like the home and login pages | 7 days, renewed on use |
| `dsab_g_state`, `dsab_g_verifier`, `dsab_g_next` | Protect the Google sign-in round trip | 10 minutes |
| `pending_fork` | Remembers the share token of a problem you chose to fork while you sign in or sign up, so the fork can finish afterwards | 1 day, or until the fork is done |

The `dsab_` cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production. `pending_fork` is the exception: it is set by the page's own script, so it is not `HttpOnly` (it is `SameSite=Lax`). It holds only the public share token and is only set when you press **Fork** on a shared page.

Your browser's storage is used for a few things, which stay in your browser:

- **Local storage:** your theme choice (light or dark), under the key `theme`.
- **Session storage** (cleared when the tab closes): while you connect OpenRouter, a one-time verifier and the page to return to, removed when you come back; and, after **Draft an attempt**, the text read from your sketch and a link to its picture, removed once the workspace picks it up.
- **Memory only:** code you write in the Playground lives in the page while it is open. It is not saved to your browser or sent to us.

## 7. Security

We protect your information with encryption in transit (HTTPS), hashed passwords, encrypted API keys, short-lived sessions, origin checks on requests that change data, rate limiting, and by restricting every query to the signed-in account. Code that the AI generates to trace your approach runs in an isolated sandbox. No system is perfectly secure, so we cannot guarantee absolute security, and you should keep your password and API keys safe.

## 8. Your choices and rights

You can:

- view and update your name, profile photo, language, display preferences and AI provider from **Settings** and **Profile**;
- remove or replace your AI keys, or delete saved ones, at any time;
- delete individual problems, attempts and solutions and the content stored with them, and delete pictures from your image library;
- stop sharing an attempt or solution at any time, which turns its public link off;
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
