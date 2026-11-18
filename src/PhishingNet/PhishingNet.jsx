import React from 'react'
import { Link } from 'react-router-dom'
import "./PhishingNet.css"
import { Navbar } from '../Components/Navbar/Navbar'
import { projects } from '../data/projects'

/**
 * Project page for PhishingNet: problem, how it works, results, screenshots,
 * ethics and privacy, the current study, what's next and a dev log.
 *
 * Sources: the research paper (public/files/phishingnet/PhishingNet-Research-Paper.pdf),
 * the TIS repo's README, PRIVACY.md and git history, and study/README.md.
 * Links come from projects.js so the page and the Work card can't disagree.
 */

const PAPER = '/files/phishingnet/PhishingNet-Research-Paper.pdf'

const METRICS = [
  { value: '0.991', label: 'F1 score' },
  { value: '0.9995', label: 'ROC-AUC' },
  { value: '99.3%', label: 'accuracy' },
  { value: '10,122', label: 'unseen test emails' },
]

const PIPELINE = [
  {
    step: 'Content classifier',
    body: 'TF-IDF features (word unigrams and bigrams plus character 3–5-grams) feed a logistic regression model. Because the model is linear, every word gets a signed weight, so the words that pushed an email towards "phishing" can be shown to the user.',
  },
  {
    step: '19 interpretable signals',
    body: '12 check manipulative language: urgency, fear, reward, curiosity, authority, financial pressure, credential requests, generic greetings, sender-domain spoofing, links, grammar, and capitals or tone. 7 inspect the raw message: sender authentication, link deception, obfuscation, attachment risk, business email compromise, HTML attacks and abuse of trusted hosting. Each returns a 0–1 score and the exact text, link or header that triggered it.',
  },
  {
    step: 'Noisy-OR risk fusion',
    body: 'The classifier and signals are combined with a noisy-OR, so one strong piece of evidence can raise the risk on its own instead of being averaged away. Reliability caps stop any single rule from deciding the verdict. Below 0.35 is legitimate, 0.6 and above is phishing, and anything between is suspicious.',
  },
  {
    step: 'Header-aware trust',
    body: 'Genuine security and receipt emails use the same words as phishing. If a message passes SPF/DKIM/DMARC and comes from a recognised brand or a domain at least a year old, its risk is reduced. Free-mail domains like gmail.com are excluded, because passing authentication only proves the sender has an account there.',
  },
  {
    step: 'In the inbox',
    body: 'A browser extension shows the verdict as a banner above the email in Gmail and Outlook on the web. It expands into a bar chart of every signal and the message text with the deciding words highlighted.',
  },
]

const DECISIONS = [
  { approach: 'TF-IDF + logistic regression', why: 'Accurate on text, fast, small, and directly interpretable', decision: 'Selected' },
  { approach: 'Deep learning (CNN/LSTM)', why: 'Needs a GPU and lots of data, and is a black box', decision: 'Rejected' },
  { approach: 'Transformer (BERT)', why: 'Large and slow, a black box, and no clear accuracy gain (Tawil et al., 2024)', decision: 'Rejected' },
  { approach: 'Large language model via API', why: 'Cost and delay per email, hard to reproduce, and sends private email to a third party', decision: 'Rejected' },
]

const STUDY_PARTS = [
  { part: 'Part 1', body: 'No help. Participants judge each email alone, as a baseline.' },
  { part: 'Part 2', body: 'With the tool. Half the participants see only the verdict; the other half also see the reasons, with the warning signs highlighted.' },
  { part: 'Part 3', body: 'No help again, to see whether anyone got better at spotting phishing on their own.' },
]

const NEXT = [
  { item: 'Run the study and publish the results', done: false },
  { item: 'Brand-impersonation detection: flag emails that name a brand their sender and links can\'t prove', done: true },
  { item: 'Outlook support', done: true },
  { item: 'Feed the age of each link\'s destination domain (from Link X-ray) into the risk score', done: false },
  { item: 'Catch phishing hidden in images, QR codes and attachments', done: false },
  { item: 'Support languages other than English, and retrain regularly on new phishing tactics', done: false },
]

const DEVLOG = [
  { date: 'Jul 2026', text: 'Researched phishing detection, merged six public datasets (67,472 emails), and built the first analyzer: classifier, 12 language signals, noisy-OR, a command-line tool and a desktop app.' },
  { date: 'Jul 2026', text: 'Added real-world detectors for sender authentication, link deception, obfuscation, attachments, business email compromise, HTML attacks and abuse of trusted platforms, plus a Link X-ray deep scan.' },
  { date: 'Jul 2026', text: 'Cut false positives on genuine receipts and security alerts from 79% to 0% by retraining with real transactional mail and adding the header-aware trust step. Built the first Chrome extension, with the bar chart and highlighted words.' },
  { date: 'Jul 2026', text: 'Wrote the research paper, mentored by Siddarth Mohapatra.' },
  { date: 'Aug 2026', text: 'Published a privacy policy and released PhishingNet on the Chrome Web Store. Used Gmail\'s own SPF/DKIM result for sender trust, and added support for Outlook on the web.' },
  { date: 'Sep 2026', text: 'Fixed false positives on modern marketing mail and caught plain-wording business email compromise.' },
  { date: 'Oct 2026', text: 'Added brand-impersonation detection, one of the paper\'s future enhancements, and stopped trusting platform emails that redirect to a stranger\'s site.' },
  { date: 'Nov 2026', text: 'Designed and built an online study to measure whether explanations help people more than a plain label.' },
]

const REFERENCES = [
  'Salloum, S. et al. A Systematic Literature Review on Phishing Email Detection Using Natural Language Processing Techniques. IEEE Access, 2022.',
  'Patra, C.; Giri, D. Machine Learning-Based Phishing E-mail Detection Using Persuasion Principle and NLP Techniques. ICNSBT 2023, Springer, 2024.',
  'Tawil, A.A. et al. Comparative Analysis of Machine Learning Algorithms for Email Phishing Detection Using TF-IDF, Word2Vec, and BERT. Comput. Mater. Contin., 2024.',
  'Montañez, R.; Golob, E.; Xu, S. Human Cognition Through the Lens of Social Engineering Cyberattacks. Front. Psychol., 2020.',
]

export const PhishingNet = () => {
  const links = projects.find((p) => p.id === 'phishingnet')?.links || {}

  return (
    <div className="pn_page">
      <Navbar />

      <header className="pn_hero">
        <p className="pn_kicker">03 //work / phishingnet</p>
        <h1 className="pn_title dg_fadeIn">PhishingNet</h1>
        <p className="pn_lede">
          An explainable phishing detector that sits inside your inbox. It
          doesn't just say an email is dangerous — it shows you why.
        </p>
        <div className="pn_actions">
          {links.demo && (
            <a className="pn_btn pn_btn_primary" href={links.demo} target="_blank" rel="noopener noreferrer">Get the Chrome extension</a>
          )}
          <a className="pn_btn" href={PAPER} target="_blank" rel="noopener noreferrer">Read the research paper (PDF)</a>
          {links.repo && (
            <a className="pn_btn" href={links.repo} target="_blank" rel="noopener noreferrer">Code on GitHub</a>
          )}
        </div>
      </header>

      <main className="pn_main">
        <section className="pn_section">
          <h2 className="pn_h2">The problem</h2>
          <p className="pn_p">
            Phishing is the most common cyberattack because it targets people, not
            software: it creates urgency, borrows authority, and uses the same words
            as genuine email. The filters built into Gmail and Outlook are black
            boxes. They block or allow a message but never say why, so people never
            learn to spot the warning signs themselves.
          </p>
          <p className="pn_p">
            Research already shows simple, transparent models can catch phishing
            with about 99% accuracy (Patra &amp; Giri, 2023), yet no tool tells the
            user what made an email suspicious. Heavy workload is a major reason
            people fall for phishing (Montañez et al., 2020), so a warning has to be
            immediate and easy to understand. That matters more now that
            AI-written phishing no longer has the spelling mistakes people relied on.
          </p>
        </section>

        <section className="pn_section">
          <h2 className="pn_h2">See it working</h2>
          <figure className="pn_figure">
            <img src="/files/phishingnet/inbox-phishing.png" alt="PhishingNet banner in Gmail reading 'PHISHING, risk 99%', with a bar chart of signal scores and the deciding words highlighted in the email text" loading="lazy" />
            <figcaption>
              A fake "account deactivated" email flagged at 99% risk. The banner
              names the signals (credential request, urgency, fear), charts every
              score, and highlights the words that decided it.
            </figcaption>
          </figure>
          <figure className="pn_figure">
            <img src="/files/phishingnet/inbox-safe.png" alt="PhishingNet banner in Gmail reading 'LOOKS SAFE, risk 20%' above a genuine Google security alert" loading="lazy" />
            <figcaption>
              A genuine Google security alert marked safe, even though "new
              sign-in" and "secure your account" sound like phishing. The
              header-aware trust step recognises an authenticated, established
              sender.
            </figcaption>
          </figure>
        </section>

        <section className="pn_section">
          <h2 className="pn_h2">How it works</h2>
          <ol className="pn_pipeline">
            {PIPELINE.map((s, i) => (
              <li key={s.step} className="pn_step">
                <span className="pn_step_num">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3 className="pn_h3">{s.step}</h3>
                  <p className="pn_p">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="pn_section">
          <h2 className="pn_h2">Results</h2>
          <ul className="pn_metrics">
            {METRICS.map((m) => (
              <li key={m.label} className="pn_metric">
                <span className="pn_metric_value">{m.value}</span>
                <span className="pn_metric_label">{m.label}</span>
              </li>
            ))}
          </ul>
          <p className="pn_p">
            The classifier was trained on 47,230 emails from six public datasets
            (Enron, CEAS-08, Ling-Spam, Nazario, a Nigerian-fraud set and
            SpamAssassin). It was then tested on 10,122 emails it had never seen.
            Retraining with real receipts and account emails cut false positives on
            that kind of mail <strong>from 79% to 0%</strong> without missing more
            phishing.
          </p>
          <figure className="pn_figure">
            <img src="/files/phishingnet/validation.png" alt="Confusion matrix, ROC curve and bar chart of accuracy, precision, recall, F1 and ROC-AUC on the 10,122-email test set" loading="lazy" />
            <figcaption>Confusion matrix, ROC curve and scores on the held-out test set.</figcaption>
          </figure>
          <p className="pn_note">
            A known limitation: the legitimate emails are mostly 2000s Enron
            corporate mail, so the model can partly learn "corporate style = safe".
            This is measured per source and documented in the repo, not hidden.
          </p>
        </section>

        <section className="pn_section">
          <h2 className="pn_h2">Design decisions</h2>
          <p className="pn_p">
            Every option was judged on accuracy, interpretability, speed and
            privacy, and whether it could run inside the inbox.
          </p>
          <div className="pn_table_wrap">
            <table className="pn_table">
              <thead>
                <tr><th>Approach</th><th>Why</th><th>Decision</th></tr>
              </thead>
              <tbody>
                {DECISIONS.map((d) => (
                  <tr key={d.approach}>
                    <td>{d.approach}</td>
                    <td>{d.why}</td>
                    <td className={d.decision === 'Selected' ? 'pn_selected' : ''}>{d.decision}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pn_p">
            A browser extension won over a website, which would sit outside the
            inbox, and over a Gmail/Outlook add-on, which needs a vendor review to
            distribute.
          </p>
        </section>

        <section className="pn_section">
          <h2 className="pn_h2">Ethics &amp; privacy</h2>
          <ul className="pn_bullets">
            <li>The model is trained only on public, anonymised email datasets, never on anyone's private mail.</li>
            <li>The extension checks only the email you have open. It sends that email's text to the PhishingNet analysis service, where it is analysed in memory and is <strong>not stored, logged or kept</strong>, and nothing is sold or shared. The analyzer can also run entirely on your own computer.</li>
            <li>PhishingNet is advisory: it warns and explains, but never deletes, moves or reports an email. You make the final decision.</li>
            <li>Every verdict shows its evidence, so you can check the reasoning instead of trusting the tool blindly. Wrong verdicts found in testing were diagnosed and fixed.</li>
          </ul>
          <p className="pn_note">
            Full details are in the <a href="https://dubaiplayer.github.io/TIS/PRIVACY.html" target="_blank" rel="noopener noreferrer">privacy policy</a>.
          </p>
        </section>

        <section className="pn_section">
          <h2 className="pn_h2">Testing next: does explaining help?</h2>
          <p className="pn_p">
            High accuracy shows the tool can catch phishing. It doesn't show that
            the explanations help people. My current research asks:{' '}
            <strong>does explaining why an email is suspicious help people more
            than a simple "phishing / not phishing" label?</strong>
          </p>
          <p className="pn_p">
            In an online study, participants sort 30 realistic but fake work emails
            on their own device, from a link, with nothing to install:
          </p>
          <ul className="pn_parts">
            {STUDY_PARTS.map((s) => (
              <li key={s.part}><span className="pn_part">{s.part}</span>{s.body}</li>
            ))}
          </ul>
          <p className="pn_p">
            It measures accuracy, risky actions such as clicking a scam link, false
            alarms and confidence. No real emails and no personal data are used.
          </p>
          <p className="pn_status">Status: built, launching soon after ethics review.</p>
        </section>

        <section className="pn_section">
          <h2 className="pn_h2">What's next</h2>
          <ul className="pn_next">
            {NEXT.map((n) => (
              <li key={n.item} className={n.done ? 'pn_done' : ''}>
                <span className="pn_tick" aria-hidden="true">{n.done ? '✓' : '○'}</span>
                {n.item}
                {n.done && <span className="pn_sr"> (done)</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className="pn_section">
          <h2 className="pn_h2">Dev log</h2>
          <ol className="pn_log">
            {DEVLOG.map((d, i) => (
              <li key={i}>
                <span className="pn_log_date">{d.date}</span>
                <p className="pn_p">{d.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="pn_section">
          <h2 className="pn_h2">Research paper &amp; poster</h2>
          <p className="pn_p">
            The full write-up covers the literature review, every design decision,
            implementation and testing.
          </p>
          <div className="pn_actions">
            <a className="pn_btn pn_btn_primary" href={PAPER} target="_blank" rel="noopener noreferrer">Read the research paper (PDF)</a>
          </div>
          <figure className="pn_figure">
            <a href="/files/phishingnet/poster.png" target="_blank" rel="noopener noreferrer">
              <img src="/files/phishingnet/poster.png" alt="PhishingNet research poster: abstract, background research, objectives, methodology and validation results" loading="lazy" />
            </a>
            <figcaption>Research poster. Click to open full size.</figcaption>
          </figure>
          <h3 className="pn_h3">Key references</h3>
          <ul className="pn_refs">
            {REFERENCES.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </section>

        <p className="pn_back"><Link to="/work">← all projects</Link></p>
      </main>
    </div>
  )
}
