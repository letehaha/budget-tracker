# MoneyMatter translation style guide

Applies to every language; a language guide adds to it and wins on conflict. Where legacy English conflicts with this guide, follow the guide.

## 1. Product and voice

- MoneyMatter is a personal-finance app (accounts, budgets, investments, venture, loans, recurring payments) for financially literate users: keep finance terms precise.
- Plain, friendly, direct, short sentences. "We" is MoneyMatter working for the user. Option labels in the user's voice stay first person ("I paid this").
- Humour is rare and dry ("This page is off the books"): a local idiom with the same feel, or plain meaning.
- Never add "!" or "successfully". Add "please" only if your language's UI normally uses it in instructions, then consistently.

## 2. Your locale

- Follow your language's norms for capitalization, punctuation, quotation marks, dashes, ellipsis and ranges.
- Keep the form of address, terms and quote style consistent with your locale's approved translations; if there are none, use the register usual for finance apps in your market. Never mix registers.
- One English term, one translation, unless §9 lists different senses.

## 3. Capitalization and punctuation

- Sentence case for buttons, titles, labels, tabs, menus and table headers.
- A lowercase fragment with no end punctuation ("between") goes inside a sentence: keep it lowercase, in the form the host needs.
- Name screens by their exact translated label, paths with →: "Settings → Currencies".
- Labels, titles and one-fragment toasts: no end punctuation. Full sentences: a period.
- Form labels take no colon. Keep it after a lead-in ("What will happen:") and between label and value ("Max: {amount}").
- Sentence dashes: your language's dash and spacing, never a hyphen.
- Keep "·" separators, a trailing "→" on links and symbols (⭐, ✓).
- Your language's quotation marks around names, UI labels and user data; straight quotes only around code identifiers.

## 4. Message patterns

- Buttons: short, your language's usual button form, the same everywhere; keep the object the source names ("Delete holding").
- Errors: "Failed to…", "Couldn't…", "Unable to…": one pattern; keep the next step ("Check your connection and try again.").
- Validation is an instruction: "Enter a name for this automation."
- Empty states: "No automations yet", what it does or the next step, "Create your first automation".
- Confirmations: a question title stays a question ("Delete tag?"), a statement ("Sync Recently Completed") a statement; keep the confirm button's verb. The "cannot be undone" variants ("This can't be undone.") get one translation.
- Success toasts state what happened, no period: "Tag created".
- Partial success keeps both halves ("Invitation created, but the email couldn't be delivered.").
- One form for every "Select a …" placeholder and one "(optional)" suffix.

## 5. Reading the key

A string's key shows its role; when patterns overlap, the last key segment decides:

- *Button, *Action, actions.*, confirmLabel, buttonLabel, acceptLabel, an *AriaLabel naming an action: button. title, *Title: heading. description, *Hint, \*Tooltip: body text.
- Other _Label, columns._, headers._, tabs._, filters.*: noun label; toggle and checkbox labels are verb phrases ("Show archived accounts"). *Placeholder: hint in an empty field.
- notifications.*, *Success, *Failed, *Error, errors.*: toast or error. *Loading: progress label. navigation.\*: sidebar item that truncates: shortest natural term.
- packages/backend/ strings are server messages; the rest is the web app.

Unsure? Comment on the string, or pick the reading the key suggests.

## 6. Placeholders and special characters

- Web-app strings use {name}, backend strings {{name}}. Copy every token exactly; move it freely, but never translate, rename or drop one, and add one only to plural forms (§7).
- {link}, {strong}, {phrase} and similar usually become a link, bold text or a button ({code} may be a plain currency code); place them where your grammar needs.
- Keep leading and trailing spaces (" per year"). Pieces joined in a fixed order (perYear after an amount, attemptedLabel before a path) must read as one text.
- Grammar agreeing with user data ({name}, unknown gender): add your own noun and agree with it (the account "{name}"). If the entity type varies ({from}, {to}), phrase so nothing agrees.
- Code-inserted words ({action}, relinkWarning's {reconnect}): phrase so every sibling string that fills them fits. {reconnect} and {connectionValidity} arrive quoted: add no quotes.
- Mirror the source: {'@'} stays {'@'}, a plain @ stays plain. In web-app strings, an @ or | you add becomes {'@'} or {'|'} (a bare | splits plural forms); braces are {'{'} {'}'}.
- No HTML. Keep every \n the source has; add none.

## 7. Plurals

- Web-app forms are separated by " | " and picked by count, not by your language's rules: 1 form (no " | ") fits every number; 2 forms are [exactly 1 | other]; 3 forms are [0 | exactly 1 | other]; a 4th never shows.
- Keep an English zero form ("Select accounts | Import 1 account | …") as the 0 branch.
- If your grammar needs other forms (few, many), rephrase so one form fits every number: "Categories excluded: {count}".
- Backend strings have one form. Rephrase so any number reads correctly: "Loaded {{count}} transactions." → "Transactions loaded: {{count}}."

## 8. Numbers, dates, money

- {amount} usually carries its currency symbol ("$1,234.56"), and a balance or projection its own minus; next to {currency} it is bare and unsigned. Never add +, − or "minus": the words give the direction ("Value will decrease by {amount} {currency}").
- {currency} is an ISO code (USD). {date} arrives formatted, with or without the year ("3 Mar 2026", "Mar 3"); you can't change its case or order, so build the phrase around it.
- Copy samples ("0.00", "1–31", "sk-ant-...") unchanged.
- The date field parses English only: in every "Try: …" hint ("Try: 2025, Q4, Jan 2025") translate only "Try:".
- Currency names ("US Dollar") and short units ("/mo"): your language's standard forms. Codes stay.

## 9. Easy to mistranslate

- balance: money in one account, can be negative; a loan's balance is the debt still owed. Never a balance-sheet or equilibrium word.
- account: a financial account, or the MoneyMatter login ("Delete your account"); two words if your language has them. A "system account" is a manual one.
- security: a tradable instrument; Security settings mean safety. Different words. A holding is one security in a portfolio.
- share: units of any holding, crypto too ("Price per Share"; use a units word if your stock word misfits crypto), access given to someone ("Leave share?"), or a proportion ("Share of income").
- payee: the app's cleaned-up counterparty, paid or paying: one word for both directions, ideally neutral. merchant (raw bank or invoice text) is a different word.
- subscription: the Subscription type (next to Bill, Installment) or the user's MoneyMatter plan (billing._, settings.planBilling._); two words are fine. In prose about any item ("Couldn't load your subscriptions") it is a recurring payment. Venture "subscription amount": capital committed to an SPV.
- transfer: money between the user's own accounts. Out of wallet: a one-sided transfer to or from untracked money, not the Wallet product.
- refund: income linked back to an earlier expense; noun or verb ("This entry is the refund"). An investment return ("Total Return") is a different word.
- base currency: what totals convert into; "Base amount" and "ref amount" are in it, "Original amount" is the foreign one. Settlement currency: the cash leg of a trade.
- pending: not yet booked by the bank, not accepted, or not recorded. planned: a scheduled transaction or a roadmap item.
- book: post to the ledger, not reserve. order: purchase or sort order. charge: a payment, "No charge" (free), or a fee category.
- model: car or AI model. exchange: currency or crypto exchange. Cancel is also an investment transaction type.
- "Saved" and "Grown" name parts of net-worth change; in prose reuse their translated labels.
- Seeded categories and tags (defaultCategories._, defaultTags._): natural local names.

## 10. Do not translate

- MoneyMatter, support@moneymatter.app.
- Monobank, Enable Banking, Lunch Flow, SimpleFIN, Walutomat, Stripe, YNAB, Wallet (BudgetBakers), Microsoft Money ("your Money file"), OFX, QFX, AngelList, YC, OpenStreetMap, Crowdin, Excel, S&P 500. A brand never becomes a phrase.
- Claude, ChatGPT, Gemini, OpenAI, Anthropic, Google, Groq, OpenRouter, LM Studio, vLLM, Ollama, MCP, Docker, GitHub, API, URL, CSV, PDF, JSON, OAuth, ID, env vars (ALLOWED_ORIGINS), API key values, code names ("refundedByTxIds").
- Currency codes, tickers, TVPI, DPI, IRR, NAV, SPV, GP/LP, P&L, ETF, HELOC.
- Other products' UI labels ("Register", "Remote MCP server URL"): English, inside your quotes.

Translate with care:

- APR: your language's usual term for an annual interest rate.
- Plan names (Essential, Plus, Premium, Early Adopter): translate or keep, one form everywhere, never as an ordinary word ("Included in the Plus plan").
- Venture section: your choice, but a real word, different from the Investments label.

## 11. Legacy English

- Title Case ("Create Portfolio"): write sentence case.
- "Budget deleted successfully!": drop "successfully" and "!". "Please": see §1.
- "(s)" ("Sync {count} account(s)"): never copy it. With {count} in a web-app string, write plural forms (§7); otherwise rephrase.
- "$" in copy ("Min change $"): keep it.
- One feature, several names: "Recurring Payments" and "Scheduled payments" get one translation; "Subscriptions & Bills" covers two of its types; "subscription" in prose can mean any item (§9). One form each: "Out of Wallet"/"out-of-wallet", "Lunch Flow"/"LunchFlow", "Enable Banking"/"EnableBanking".
- Typos, stiff wording: translate the meaning.
