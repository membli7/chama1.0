# Jirani Chama AI Assistant Knowledge

This is the assistant's maintained answer source, not a standalone help report. `support-service.js` loads and parses the `intent:` sections below when the server starts; restart the server after editing this file. Keep the trigger phrases and both language answers together when adding or changing a topic.

## Source and safety rules

- Follow the current decisions in the repository's `TASKS.md` and the behavior enforced by the server. A historical decision marked superseded is not current policy.
- Chama settings and loan policies are group-specific. When the chat request includes the signed-in user's Chama settings, the service fills `{{deadline}}`, `{{welfareFee}}`, `{{latePenalty}}`, and `{{loanRate}}`; it fills `{{loanPolicyDetails}}` only from that Chama's latest saved policy. When a value is unavailable, the answer says to check that Chama's configured rule; never substitute a guessed universal amount or threshold.
- The assistant has no authority to see or infer a member's balance, payment status, application status, or private records from this document. Only state a personal fact if trusted live context explicitly supplies it; otherwise direct the person to the relevant dashboard or human support.
- Do not promise that money is sent, collected, reconciled, or disbursed by the app. Do not claim a fixed eligibility multiple, fine amount, review deadline, or other rule unless the current Chama setting or an authoritative source explicitly provides it.
- If no topic below answers the question, say that the approved knowledge does not contain the answer, ask one useful clarifying question if appropriate, and offer the in-app support ticket. Do not invent policy.
- Never ask a user to disclose a PIN, password, one-time code, or recovery code in chat.

## intent:welcome
**Triggers (English):**
**Triggers (Kiswahili):**
### English
I can help with registering or joining a Chama, the Chama's configured loan rules, cash contributions and recorded fines, PIN recovery, meeting attendance, dividends, elections, in-app group chat, and contacting human support. I cannot see private account records unless the application supplies them in trusted live context.
### Kiswahili
Naweza kusaidia kuhusu kusajili au kujiunga na chama, kanuni za mikopo zilizowekwa na chama, michango ya pesa taslimu na faini zilizorekodiwa, kurejesha PIN, mahudhurio ya mikutano, gawio, uchaguzi, mazungumzo ya kikundi ndani ya programu, na kuwasiliana na wahudumu wa msaada. Siwezi kuona taarifa binafsi za akaunti isipokuwa programu inipe taarifa hizo kutoka kwenye muktadha salama wa wakati huo.

## intent:greeting
**Triggers (English):** hi | hello | hey | good morning | good afternoon | good evening | greetings
**Triggers (Kiswahili):** habari | hujambo | jambo | mambo | shikamoo | niaje | salamu
### English
Welcome to Jirani Chama support. Ask about a Chama feature or rule, or tell me what page or action you need help with. For a question about your own records, check your dashboard or contact human support.
### Kiswahili
Karibu kwenye msaada wa Jirani Chama. Uliza kuhusu kipengele au kanuni ya chama, au nieleze ukurasa au hatua unayohitaji msaada nayo. Kwa swali kuhusu taarifa zako binafsi, angalia dashibodi yako au wasiliana na mhudumu wa msaada.

## intent:register-new-chama
**Triggers (English):** register a new chama | create a new chama | start a new chama | register chama
**Triggers (Kiswahili):** sajili chama kipya | kusajili chama kipya | anzisha chama kipya | kuanzisha chama kipya
### English
On the home page, choose **Register a New Chama**. Enter the Chama and Chairperson details, review the group settings shown during setup (including contribution timing and financial rules), accept the Terms and Conditions and acknowledge the Privacy Notice, then set a PIN that meets the displayed requirements (currently 6–12 digits). The values selected during setup belong to that Chama; do not assume another group's settings are the same.
### Kiswahili
Kwenye ukurasa wa mwanzo, chagua **Register a New Chama**. Weka taarifa za chama na mwenyekiti, kagua mipangilio inayoonyeshwa wakati wa usajili (ikiwemo muda wa michango na kanuni za fedha), kubali Masharti na vigezo na uthibitishe kwamba umeona Ilani ya Faragha, kisha weka PIN inayokidhi masharti yanayoonyeshwa (kwa sasa tarakimu 6–12). Mipangilio iliyochaguliwa ni ya chama hicho; usidhani kuwa vyama vingine vina mipangilio hiyo hiyo.

## intent:join-existing-chama
**Triggers (English):** join an existing chama | join existing chama | invitation code | invite code | activation code | enter invite code
**Triggers (Kiswahili):** kujiunga na chama | jiunge na chama | msimbo wa mwaliko | msimbo wa kujiunga
### English
To join an existing Chama, ask its Chairperson or Secretary for an invitation/activation code. On the Member Login page, choose **Enter Invite Code**, enter the code, confirm the phone number registered with the Chama, set a private 6–12 digit PIN, and accept the Terms. A Secretary may invite ordinary Members directly. Never send your PIN or the invitation code to an unrelated person.
### Kiswahili
Kujiunga na chama kilichopo, omba msimbo wa mwaliko/kujiunga kutoka kwa Mwenyekiti au Katibu wa chama. Kwenye ukurasa wa Member Login, chagua **Enter Invite Code**, weka msimbo, thibitisha nambari ya simu iliyosajiliwa kwenye chama, weka PIN binafsi ya tarakimu 6–12, kisha kubali Masharti. Katibu anaweza kuwaalika Wanachama wa kawaida moja kwa moja. Usitume PIN yako au msimbo wa mwaliko kwa mtu asiyehusika.

## intent:loan
**Triggers (English):** loan | loans | borrow | borrowing | lend | credit | interest | guarantor | guarantors | loan limit | loan eligibility | loan application | loan interest | loan review | repayment | repayment estimate
**Triggers (Kiswahili):** mkopo | mikopo | kukopa | mdhamini | wadhamini | dhamana | kiwango cha mkopo | masharti ya mkopo | riba | riba ya mkopo | marejesho | marejesho ya mkopo
### English
### Current loan rules
- The Chairperson configures each Chama's loan eligibility rules, including group-balance and member-contribution caps and tiers for minimum active-membership days and share-capital contributions. There is **no universal eligibility threshold or fixed share-capital multiplier**. Your Chama's configured policy determines the limit. If the policy is not configured, the app does not record a new application; ask the Chairperson to set it up.
- Current configured caps and tiers, when available: {{loanPolicyDetails}}
- A borrower selects exactly **two different active Chama members** as guarantors. The selected guarantors' unpledged share capital must cover the requested amount.
- Supported terms are **1, 2, 3, or 6 months**. The estimate uses a reducing-balance schedule and the monthly rate configured for the Chama ({{loanRate}}).
- The server decides immediately under the configured rules and shows the reasons. The borrower may request **one** human review. An active, non-conflicted Chama officer reviews it; no fixed response deadline is promised, and the review finding does not itself change the recorded loan status or authorize funds.
- The app records the decision, schedule, and cash repayments. It does **not** transfer or disburse loan money; any actual lending and payment happens outside the app.
### Kiswahili
### Kanuni za sasa za mikopo
- Mwenyekiti huweka kanuni za ustahiki wa mikopo kwa kila chama, zikiwemo ukomo unaohusiana na salio la kikundi na michango ya mwanachama, pamoja na viwango vya siku za uanachama hai na michango ya mtaji wa hisa. **Hakuna kigezo cha jumla cha ustahiki wala kizidishi maalum cha mtaji wa hisa kwa vyama vyote.** Sera iliyowekwa na chama chako ndiyo huamua kiwango. Ikiwa sera haijawekwa, programu haisajili ombi jipya; mwombe Mwenyekiti aweke kanuni hizo.
- Ukomo na viwango vilivyowekwa kwa sasa, ikiwa vinapatikana: {{loanPolicyDetails}}
- Mwombaji huchagua **wanachama hai wawili tofauti** wa chama kuwa wadhamini. Mtaji wa hisa ambao wadhamini hao hawajaweka dhamana lazima utoshe kufidia kiasi kinachoombwa.
- Muda unaoruhusiwa ni **mwezi 1, 2, 3 au 6**. Makadirio hutumia ratiba ya salio linalopungua na riba ya kila mwezi iliyowekwa na chama ({{loanRate}}).
- Seva hutoa uamuzi mara moja kwa kutumia kanuni zilizowekwa na huonyesha sababu. Mwombaji anaweza kuomba **ukaguzi mmoja** wa kibinadamu. Afisa hai wa chama asiye na mgongano wa maslahi ndiye hukagua; hakuna muda maalum wa kujibiwa ulioahidiwa, na matokeo ya ukaguzi pekee hayabadili hali ya uamuzi iliyorekodiwa wala kuidhinisha fedha.
- Programu hurekodi uamuzi, ratiba na marejesho ya pesa taslimu. **Haihamishi wala kutoa fedha za mkopo**; ukopeshaji na malipo halisi hufanyika nje ya programu.

## intent:contributions
**Triggers (English):** contribution | contributions | deposit | welfare | welfare fee | monthly payment | late payment | late contribution | late fine | fine | penalty | penalties | record cash | contribution deadline
**Triggers (Kiswahili):** mchango | michango | ada ya ustawi | malipo ya mwezi | mchango wa kuchelewa | faini | adhabu | tarehe ya mwisho ya mchango
### English
### Contributions and recorded fines
- The contribution deadline is the date configured for the Chama ({{deadline}}). The monthly welfare fee is also Chama-specific ({{welfareFee}}); do not present either value as a universal rule.
- A Chama Treasurer records member contributions as **cash received** in the app. The server splits a recorded contribution according to the configured welfare fee and any applicable recorded fine; the remaining amount becomes share capital. Members and the Treasurer can check recorded transactions in the Ledger.
- The Chama's late-fine/penalty amount is configured per group ({{latePenalty}}). The system supports a manual monthly assessment after the deadline, and a fine can also be included when a Treasurer records a late cash contribution. Do not say that a bank, M-PESA, or Paybill payment is automatically collected or reconciled.
- The app records the entry; it does not send money to the Chama or verify an off-app transfer. Ask the Treasurer about the Chama's payment instructions or a disputed ledger entry.
### Kiswahili
### Michango na faini zilizorekodiwa
- Tarehe ya mwisho ya mchango ni tarehe iliyowekwa na chama ({{deadline}}). Ada ya kila mwezi ya ustawi pia hutegemea mipangilio ya chama ({{welfareFee}}); usiwasilishe thamani yoyote kati ya hizi kama kanuni ya vyama vyote.
- Mweka Hazina hurekodi michango ya wanachama kama **pesa taslimu zilizopokelewa** kwenye programu. Seva hugawa mchango uliorekodiwa kwa kuzingatia ada ya ustawi na faini zozote zinazotumika na kurekodiwa; kiasi kinachobaki huongezwa kwenye mtaji wa hisa. Mwanachama na Mweka Hazina wanaweza kukagua miamala iliyorekodiwa kwenye Ledger.
- Kiasi cha faini za kuchelewa huwekwa kwa kila chama ({{latePenalty}}). Mfumo unaunga mkono tathmini ya faini za mwezi inayofanywa na kiongozi baada ya tarehe ya mwisho; faini pia inaweza kujumuishwa Mweka Hazina anaporekodi mchango wa pesa taslimu uliochelewa. Usiseme kuwa malipo ya benki, M-PESA au Paybill hukusanywa au kulinganishwa kiotomatiki.
- Programu hurekodi ingizo tu; haitumi pesa kwa chama wala kuthibitisha uhamisho uliofanyika nje ya programu. Muulize Mweka Hazina kuhusu maelekezo ya malipo ya chama au ingizo la Ledger unalopinga.

## intent:payment-automation
**Triggers (English):** m-pesa | mpesa | paybill | payment confirmation | did my payment go through | money transfer | send money | payment matching
**Triggers (Kiswahili):** m-pesa | mpesa | paybill | uthibitisho wa malipo | je malipo yamefika | kutuma pesa | uhamisho wa pesa
### English
The app does not process or match Chama contribution payments from M-PESA or Paybill, and it cannot confirm a transfer made outside the app. For a contribution to appear in the Ledger, the Chama Treasurer records the cash received. Check directly with your Treasurer for the group's payment instructions or to resolve a missing entry. The loan feature also records decisions and repayments; it does not disburse money.
### Kiswahili
Programu haifanyi uchakataji au ulinganishaji wa michango ya chama kupitia M-PESA au Paybill, na haiwezi kuthibitisha uhamisho uliofanywa nje ya programu. Ili mchango uonekane kwenye Ledger, Mweka Hazina wa chama hurekodi pesa taslimu zilizopokelewa. Wasiliana moja kwa moja na Mweka Hazina ili upate maelekezo ya malipo ya kikundi au utatue ingizo linalokosekana. Kipengele cha mikopo pia hurekodi uamuzi na marejesho; hakitoi fedha.

## intent:pin
**Triggers (English):** pin | password | forgot | forgot pin | reset | reset pin | pin reset | lockout | unlock | account locked | login locked | recovery code | code
**Triggers (Kiswahili):** pin | namba ya siri | nenosiri | nimesahau pin | kusahau pin | kuweka upya pin | poteza | kupoteza | sikumbuki | fungua akaunti | msimbo | akaunti imefungwa
### English
- New PINs must meet the displayed **6–12 digit** requirement. A legacy 4-digit PIN can still be used to sign in, after which the account must change it.
- After five failed sign-in attempts for a phone number or IP address, the login is locked for 15 minutes.
- For a forgotten PIN, use **Forgot PIN?** on the Member Login page and follow the instructions sent to the registered email when email recovery is available. If you cannot complete recovery, submit an in-app support ticket. Never share your PIN or reset code with anyone, including support staff.
### Kiswahili
- PIN mpya lazima itimize sharti linaloonyeshwa la tarakimu **6–12**. PIN ya zamani ya tarakimu 4 bado inaweza kutumika kuingia, lakini akaunti italazimika kuibadilisha baada ya kuingia.
- Baada ya majaribio matano ya kuingia yasiyofanikiwa kwa nambari ya simu au anwani ya IP, kuingia hufungwa kwa dakika 15.
- Ukisahau PIN, tumia **Forgot PIN?** kwenye ukurasa wa Member Login na ufuate maelekezo yanayotumwa kwenye barua pepe iliyosajiliwa ikiwa urejeshaji kwa barua pepe unapatikana. Ikiwa huwezi kukamilisha urejeshaji, tuma ombi la msaada ndani ya programu. Usimpe mtu yeyote PIN au msimbo wa urejeshaji, hata mfanyakazi wa msaada.

## intent:attendance
**Triggers (English):** attendance | meeting | meeting attendance | attendance register | register | absent | absence | apology | meeting register
**Triggers (Kiswahili):** mahudhurio | mkutano | rejista ya mahudhurio | kutohudhuria | udhuru | sikuhudhuria | sikuwepo
### English
The Secretary creates and manages the attendance register for scheduled meetings. The available statuses are **Present**, **Absent with Apology**, and **Absent**. Chama rules govern any fine for an unexcused absence; there is no universal fine amount. Ask the Secretary or Chairperson about the group's rule or a recorded fine.
### Kiswahili
Katibu huunda na kusimamia rejista ya mahudhurio ya mikutano iliyopangwa. Hali zinazopatikana ni **Present**, **Absent with Apology**, na **Absent**. Kanuni za chama ndizo huamua faini ya kutohudhuria bila udhuru; hakuna kiasi kimoja cha faini kwa vyama vyote. Muulize Katibu au Mwenyekiti kuhusu kanuni ya kikundi au faini iliyorekodiwa.

## intent:dividends
**Triggers (English):** dividend | dividends | profit | profit sharing | distribution | distribute profit | dividend calculation | payout | share capital
**Triggers (Kiswahili):** gawio | gawio la chama | ugawaji wa faida | mgawo | kuhesabu gawio | malipo ya gawio | hisa
### English
The Chairperson or Treasurer can preview a dividend cycle. The preview calculates income from loan interest and paid penalties during the selected date range, subtracts recorded administration expenses, then distributes a positive pool among active members in proportion to their recorded share capital (rounded to whole KES). The authorized officer must commit the preview. A preview does not pay anyone; committing records the dividend as share capital in the app. It does not transfer cash to a member.
### Kiswahili
Mwenyekiti au Mweka Hazina anaweza kukagua makadirio ya gawio kwa kipindi fulani. Makadirio huhesabu mapato ya riba ya mikopo na faini zilizolipwa katika tarehe zilizochaguliwa, hutoa gharama za uendeshaji zilizorekodiwa, kisha hugawa salio chanya kwa wanachama hai kulingana na mtaji wao wa hisa uliorekodiwa (kwa shilingi kamili za KES). Kiongozi aliyeidhinishwa lazima athibitishe makadirio hayo. Makadirio hayamlipi mtu; kuyathibitisha hurekodi gawio kama mtaji wa hisa ndani ya programu. Hakuna pesa taslimu inayohamishiwa kwa mwanachama.

## intent:roles
**Triggers (English):** chairperson | secretary | treasurer | officer | leader | member role | role | role permissions | who can invite | invite members | group leadership
**Triggers (Kiswahili):** mwenyekiti | katibu | mweka hazina | kiongozi | viongozi | majukumu ya viongozi | nani anaweza kualika | kuwaalika wanachama | uongozi wa chama
### English
The app has Chairperson, Secretary, Treasurer, and Member roles. A Secretary can invite ordinary Members directly. Chairpersons and Treasurers record or manage the financial workflows assigned to them; the Secretary manages attendance registers and can assess monthly missed-contribution penalties after the deadline. The repository decisions keep broad roster and balance visibility for the Secretary and Treasurer. After initial setup, changes to leadership roles must use the election workflow.
### Kiswahili
Programu ina majukumu ya Mwenyekiti, Katibu, Mweka Hazina na Mwanachama. Katibu anaweza kuwaalika Wanachama wa kawaida moja kwa moja. Mwenyekiti na Mweka Hazina husimamia taratibu za fedha walizopangiwa; Katibu husimamia rejista za mahudhurio na anaweza kutathmini faini za michango ya mwezi iliyokosekana baada ya tarehe ya mwisho. Maamuzi ya mradi yanaweka ruhusa pana ya kuona orodha ya wanachama na salio kwa Katibu na Mweka Hazina. Baada ya usanidi wa awali, mabadiliko ya nafasi za uongozi lazima yafanyike kupitia uchaguzi.

## intent:elections
**Triggers (English):** election | elections | vote | voting | ballot | nominate a leader | leadership change
**Triggers (Kiswahili):** uchaguzi | chaguzi | kura | kupiga kura | kumpendekeza kiongozi | mabadiliko ya uongozi
### English
Either the Chairperson or Secretary can schedule an election with 2–20 active ordinary Member candidates and a date. Voting opens at 12:00 a.m. and closes at 11:59 p.m. Africa/Nairobi time on that date. All active Chama accounts may vote once by secret ballot; the highest vote total wins and there is no quorum requirement. A tie for the highest total requires a separately scheduled runoff limited to the tied candidates. The winner's role and portal access switch automatically when the election closes.
### Kiswahili
Mwenyekiti au Katibu anaweza kupanga uchaguzi wenye wagombea 2–20 ambao ni Wanachama wa kawaida walio hai na kuweka tarehe. Upigaji kura huanza saa 12:00 usiku na hufungwa saa 11:59 usiku kwa saa za Africa/Nairobi katika tarehe hiyo. Akaunti zote hai za chama zinaweza kupiga kura ya siri mara moja; anayepata kura nyingi zaidi hushinda na hakuna kiwango cha chini cha wapiga kura. Sare ya kura nyingi zaidi huhitaji uchaguzi wa marudio uliopangwa tofauti, kwa wagombea waliofungana pekee. Nafasi na ruhusa za mshindi hubadilishwa kiotomatiki uchaguzi unapofungwa.

## intent:group-chat
**Triggers (English):** chat | group chat | in-app chat | chat with members | message the group
**Triggers (Kiswahili):** mazungumzo ya kikundi | gumzo la kikundi | kuzungumza na wanachama | ujumbe wa kikundi
### English
Active Members can use the in-app group chat. This is an in-app feature; it is not an SMS or WhatsApp broadcast service.
### Kiswahili
Wanachama walio hai wanaweza kutumia mazungumzo ya kikundi ndani ya programu. Hiki ni kipengele cha ndani ya programu; si huduma ya kutuma matangazo kwa SMS au WhatsApp.

## intent:human-support
**Triggers (English):** human support | support agent | talk to a person | contact support | support ticket | representative | customer service
**Triggers (Kiswahili):** mhudumu wa msaada | msaada wa kibinadamu | kuzungumza na mtu | wasiliana na msaada | ombi la msaada | huduma kwa wateja
### English
Submit an in-app support ticket and describe the issue. You can attach supporting material where the ticket form allows it. A human reviewer can follow up through the ticket. No response deadline is promised here. Do not include a PIN, password, or one-time code in the ticket.
### Kiswahili
Wasilisha ombi la msaada ndani ya programu na ueleze tatizo. Unaweza kuambatisha taarifa za kusaidia pale fomu ya ombi inapokubali. Mhudumu wa kibinadamu anaweza kufuatilia kupitia ombi hilo. Hakuna muda maalum wa kujibiwa ulioahidiwa hapa. Usiweke PIN, nenosiri au msimbo wa mara moja kwenye ombi.

## intent:faq-not-translated
**Triggers (English):**
**Triggers (Kiswahili):**
### English
I found a relevant FAQ, but it only has an English answer. I won't guess at a translation of its instructions. You can open the FAQ or submit an in-app support ticket for help in Kiswahili.
### Kiswahili
Nimepata swali la msaada linalohusiana, lakini jibu lake linapatikana kwa Kiingereza pekee. Sitabuni tafsiri ya maelekezo yake. Unaweza kufungua FAQ hiyo au kuwasilisha ombi la msaada ndani ya programu ili upate msaada kwa Kiswahili.

## intent:unknown
**Triggers (English):**
**Triggers (Kiswahili):**
### English
I don't have a reliable answer to that in the approved Chama knowledge yet, and I don't want to guess. Which Chama feature or action are you asking about? You can also submit an in-app support ticket for a human response. I cannot see your personal balance, payment status, or loan record from this knowledge document.
### Kiswahili
Bado sina jibu la kuaminika kwa swali hilo kwenye maarifa yaliyoidhinishwa ya chama, na sitaki kubahatisha. Unauliza kuhusu kipengele au hatua gani ya chama? Unaweza pia kuwasilisha ombi la msaada ndani ya programu ili mhudumu wa kibinadamu akujibu. Siwezi kuona salio lako, hali ya malipo au rekodi ya mkopo kupitia hati hii ya maarifa.
