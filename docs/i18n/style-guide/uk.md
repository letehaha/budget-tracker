# MoneyMatter style guide: Ukrainian (uk)

Adds to the shared guide and wins where they differ. Ukrainian is maintained in the repo, and Crowdin suggestions are reviewed against these rules. Where an existing uk string differs from this guide, follow the guide.

## 1. Register and verb forms

- Address the user with formal ви/ваш, lowercase mid-sentence; capitalize only at the start of a sentence. Never ти/твій.
- Buttons and CTAs, including empty-state CTAs, use the infinitive: `Зберегти`, `Скасувати`, `Спробувати ще раз`, `Створити першу автоматизацію`.
- Select placeholders use the imperative `Виберіть …`: `Виберіть категорію`. Never `Вибрати …` or `Оберіть …` in a placeholder. A select button or action stays infinitive: `Вибрати транзакцію`.
- Sentences that tell the user what to do use the ви-imperative: `Спробуйте ще раз`, `Перевірте з'єднання`.
- Errors: `Не вдалося …`, then the next step: `Не вдалося завантажити автоматизації. Перевірте з'єднання та спробуйте ще раз.`
- Validation: `Введіть назву цієї автоматизації.`
- Success toasts: the impersonal -но/-то form, no period: `Тег створено`, `Угоду створено`.
- A confirmation title that is a question: `Видалити тег?`. All three English "cannot be undone" variants: `Цю дію неможливо скасувати.`
- Optional fields: `(необов'язково)`.

## 2. Capitalization and punctuation

- Sentence case: `Create Portfolio` → `Створити портфель`, `Select Base Currency` → `Виберіть базову валюту`.
- Common nouns stay lowercase mid-sentence, including отримувач, рахунок, підписка.
- Quotes: «» around names, UI labels, user data, menu paths and name placeholders: `Видалити «{name}»?`, `Натисніть «Register»`, `Підключіть валюту в «Налаштування → Валюти».` Straight "" only around code identifiers, API field names and env vars: `Дата "from" повинна бути раніше дати "to"`.
- Apostrophe: straight ' (`з'єднання`, `об'єднати`), never ’ or ʼ.
- Dash in a sentence: spaced em dash `—`. Ranges: `1–31`.

## 3. Plurals

- The app applies Ukrainian plural rules to uk, so shared §7's [0 | 1 | other] does not apply. Frontend: exactly 3 forms, in this order: one (1, 21, 31…) | few (2–4, 22–24…) | many (0, 5–20, 25–30…). Example: `{count} тег | {count} теги | {count} тегів`.
- Every form contains the source's count token ({count} or {n}). The first slot also shows for 21, 31…, so never a literal `1` or a phrase without the count there.
- Never 2 forms, and never a zero form (`немає рахунків | …`): 0 takes the third form.
- Backend strings have one form. Put the number after a colon so agreement never breaks: `Завантажено транзакцій: {{count}}.`, `У вас транзакцій з тегом «{{tagName}}»: {{count}}`.

## 4. Placeholders

- When grammar must agree with user data, add your own noun and agree with it: `Створити отримувача «{name}»`, `Новий рахунок «{name}» буде створений…`. {from} and {to} can be an account or a portfolio: add no noun and phrase so nothing agrees.
- Phrase inserted words so every value fits. {action} is переказ, зняття or поповнення: `Буде створено {action} на {amount} з «{from}» до «{to}»`.
- {date} arrives in a fixed form: build around it with a preposition, `до {date}`, `курс на {date}`.

## 5. Terms

- account (financial) = рахунок; account (login, "Delete your account") = обліковий запис.
- balance = баланс; a loan's outstanding balance = залишок боргу.
- security (instrument) = цінний папір; Security settings = безпека.
- holding = актив; portfolio = портфель; share of a total = частка; share (access) = спільний доступ.
- Shares (units held, crypto too) = кількість; per share = за одиницю. акції only where the text means stock.
- cost basis = базова вартість, in investments and venture alike.
- refund = повернення. Investment return = дохідність (`Річна дохідність (%)`); Total return = загальна дохідність. Never повернення or дохід (дохід = income).
- transfer = переказ; out of wallet = поза гаманцем.
- payee = отримувач, for both directions, also on income; `отримувач платежу` is fine for a standalone label or title.
- merchant = продавець, never купець.
- bank connection = банківське підключення, never з'єднання in that sense. A network connection stays з'єднання: `Перевірте з'єднання`.
- base currency = базова валюта; base amount = базова сума.
- subscription = підписка, for the Subscription type and the user's MoneyMatter plan (billing.\*); plan = план. Where "subscription" means any recurring item (`Couldn't load your subscriptions`), write регулярний платіж.
- bill (payment type) = рахунок, next to підписка and розстрочка (`Підписки та рахунки`); where it could read as account, write рахунок до сплати.
- The recurring-payments feature ("Recurring Payments", "Scheduled payments") = регулярні платежі, everywhere; one item = регулярний платіж. Never регулярні витрати: it tracks income too.
- venture deal = венчурна угода, backend too (`Венчурну угоду не знайдено`); platform = платформа. Venture section = Венчур, Ventures = Венчури; never Інвестиції or Підприємства.
- APR = річна ставка. HELOC stays HELOC.
- Plan names stay in Latin script: `план Plus`.
- transaction = транзакція; category = категорія; tag = тег; budget = бюджет.
