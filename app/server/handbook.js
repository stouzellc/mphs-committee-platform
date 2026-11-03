// Committee handbook (v1-derived working copy). Served only to users with the `planning` permission.
// Authored content; no personal data. Message drafts are factual and planning-stage.

export const HANDBOOK = [
  { id: 'purpose', title: 'Purpose and status', links: [['Overview', 'overview']], html: `
    <p>This handbook explains how the MPHS Class of 2008 committee plans the 20-year reunion, <em>Back to Pleasant</em>, and the cruise concept, <em>Pleasant, Beyond the Shore</em>.</p>
    <p>It is a working copy built from the v1 committee handbook, tracker and decks created in Codex. The v1 suite is reviewable planning material, not final event approval. Publication has not been approved.</p>
    <h3>Status at a glance</h3>
    <table><thead><tr><th>Item</th><th>Status</th><th>Reference</th></tr></thead><tbody>
      <tr><td>Creative directions</td><td>Approved</td><td>D001 · 25 Oct 2026</td></tr>
      <tr><td>Document structure</td><td>Approved</td><td>D002 · 25 Oct 2026</td></tr>
      <tr><td>Reunion date and venue</td><td>Pending</td><td>D005</td></tr>
      <tr><td>Budget and ticketing</td><td>Pending</td><td>D006</td></tr>
      <tr><td>Cruise sailing and provider</td><td>Pending</td><td>D007</td></tr>
      <tr><td>Reunion and cruise relationship</td><td>Pending</td><td>D004</td></tr>
      <tr><td>Role titles</td><td>Pending</td><td>D008</td></tr>
      <tr><td>Roster verified against yearbook</td><td>Pending</td><td>D009</td></tr>
    </tbody></table>` },
  { id: 'roles', title: 'People and roles', links: [['Tasks', 'tasks'], ['Access', 'access']], html: `
    <table><thead><tr><th>Planning lead</th><th>Existing responsibilities</th></tr></thead><tbody>
      <tr><td>Esaie Touze</td><td>Creative direction, sponsorships and key relationships</td></tr>
      <tr><td>the co-lead (name withheld)</td><td>Planning, operations, outreach and committee coordination</td></tr>
    </tbody></table>
    <p>Use “Planning leads” until both organizers confirm consistent formal titles. Earlier files use Chair, Co-Chair and Executive Producer inconsistently (D008, task T001).</p>
    <h3>Roles to assign</h3>
    <p>Treasury, communications, social media, venue and logistics, entertainment, decorations, sponsorship support, and photography or video each need a named owner. One person can hold more than one role if the workload is clear.</p>
    <h3>Meetings</h3>
    <p>Choose a meeting cadence together. At each meeting, review unresolved decisions and overdue actions, then assign an owner and next step. Due dates should reflect the agreed event schedule rather than an invented deadline.</p>
    <h3>Proposed access roles</h3>
    <table><thead><tr><th>Role</th><th>Can see and do</th></tr></thead><tbody>
      <tr><td>Visitor</td><td>Only approved public event content and artwork.</td></tr>
      <tr><td>Invited classmate</td><td>Approved content, plus their own participation and submissions.</td></tr>
      <tr><td>Organizer</td><td>Assigned planning records and approved operational views. CRM access is granted separately.</td></tr>
      <tr><td>Administrator</td><td>Membership and access management, with restricted CRM permissions.</td></tr>
    </tbody></table>
    <p>Actual membership must be approved by the planning leads before any shared release.</p>` },
  { id: 'decisions', title: 'How decisions are made', links: [['Decisions', 'decisions']], html: `
    <p>A decision is final only when it is recorded in the Decisions register with an approver, a date and evidence. Polished copy in a deck or post never counts as approval.</p>
    <h3>Rules</h3>
    <ul>
      <li>Record proposals as <em>Proposed</em>; unknowns stay <em>Pending</em>.</li>
      <li>When a decision changes, mark the old record <em>Superseded</em> and link it to the new one. Never overwrite history.</li>
      <li>If two sources disagree, log the conflict and keep the fact pending until it is resolved.</li>
      <li>Every public statement about dates, venues, prices or bookings must trace to an approved decision.</li>
    </ul>` },
  { id: 'facts', title: 'Approved facts register', links: [['Decisions', 'decisions']], html: `
    <p>The live register is the Decisions view in the organizer workspace. At the time this handbook copy was prepared, two records were approved and seven were pending.</p>
    <table><thead><tr><th>Fact</th><th>Status</th><th>Source</th></tr></thead><tbody>
      <tr><td>MPHS Class of 2008 is planning for 2028</td><td>Context</td><td>Consistent across the v1 suite</td></tr>
      <tr><td>Planning leads: Esaie Touze and the co-lead (name withheld)</td><td>Context, titles pending</td><td>Original tracker Committee rows (audit); v1 deck slide 11</td></tr>
      <tr><td>Palette: navy #0E1E3C, crimson #9E1B2E, white, cream #F4F2EC</td><td>Project palette</td><td>Deck slide 6, handbook section 10</td></tr>
      <tr><td>Existing Facebook Page and Instagram @mph_classof08</td><td>Supplied channels</td><td>Planning lead</td></tr>
      <tr><td>School established 1926</td><td>Source claim, unverified</td><td>Seal; original deck slide 20 (audit)</td></tr>
      <tr><td>318 roster name records</td><td>Not yearbook-verified</td><td>Private CRM v1</td></tr>
    </tbody></table>` },
  { id: 'privacy', title: 'Privacy and data', links: [['Classmate records', 'crm'], ['Access', 'access']], html: `
    <p>The alumni roster and any contact, payment, travel, dietary or accessibility details are restricted. They never appear in public pages, social posts, screenshots, demo data or downloads meant for others.</p>
    <ul>
      <li>A roster record is not permission to contact, an RSVP or a payment.</li>
      <li>Record how each contact was obtained, their preferences and opt-outs. Respect opt-outs immediately.</li>
      <li>Keep original name spellings and stable Alumni IDs. Propose corrections in a log instead of silently changing identities.</li>
      <li>Do not collect passport numbers or document copies.</li>
      <li>Do not upload the roster to advertising or contact-matching tools, and do not publish lists of missing classmates.</li>
      <li>Exports follow the same permissions as the screen. A download must not reveal more than the person could see.</li>
    </ul>` },
  { id: 'money', title: 'Money rules', links: [['Budgets', 'budgets'], ['Ledger', 'ledger'], ['Sponsors', 'sponsors']], html: `
    <p>One ledger owns confirmed receipts and refunds. Pledges, estimates, receipts and the committee bank balance are different measures and are never added together.</p>
    <h3>The ledger</h3>
    <ul>
      <li>Each transaction has a unique transaction ID and, where available, a provider reference. Duplicates are rejected or held for review.</li>
      <li>Only <em>Confirmed</em> transactions affect confirmed receipts. Confirmed refunds subtract.</li>
      <li>Record whether the provider or the committee received the money.</li>
      <li>Ledger records are never deleted. Mark a mistaken record <em>Void</em> with a reason.</li>
    </ul>
    <h3>Balances</h3>
    <ul>
      <li>A person's agreed total is separate from their net receipts. With no agreed total, their balance is <em>Pending</em>, never zero or paid.</li>
      <li>A past deposit record does not prove a deposit is still held after a refund. The workspace shows net receipts and labels deposit records as historical.</li>
    </ul>
    <h3>Budgets</h3>
    <ul>
      <li>Blank estimates are unpriced, not zero. Enter <strong>0</strong> only for an agreed no-cost category.</li>
      <li>The total including reserve stays <em>Pending</em> while any category is unpriced.</li>
      <li>The 12.5% reserve is a planning assumption from the source tracker, not approved policy.</li>
    </ul>
    <h3>Sponsors</h3>
    <p>Only Committed or Paid sponsor records count toward commitments. Prospects and declines stay out. Sponsor cash is recorded once, in the ledger.</p>
    <h3>Cabins</h3>
    <p>Count one booked cabin per unique Cabin ID after provider confirmation. Two travellers sharing a cabin are one cabin. Duplicate Cabin IDs are flagged, never guessed.</p>` },
  { id: 'reunion', title: 'Reunion chapter: Back to Pleasant', links: [['Program', 'program'], ['Vendors & quotes', 'vendors'], ['Budgets', 'budgets']], html: `
    <p>An editorial homecoming: navy, cream and crimson, varsity type, the collage and the mascot portraits, with the seal as identity anchor.</p>
    <h3>Open decisions</h3>
    <ul><li>Date and venue (D005)</li><li>Budget and ticketing (D006)</li><li>Headcount target</li><li>Ticketing platform</li></ul>
    <h3>Proposed program</h3>
    <p>Arrival and photos, welcome, dinner, school memories, teacher appreciation, memorial tribute, awards, dancing and a group photo. All proposed; times and owners pending.</p>
    <h3>Ticket tiers under consideration</h3>
    <p>Early bird, regular, late and VIP tiers are proposals in the tracker. Prices, quantities, platform and payment terms are not approved.</p>` },
  { id: 'cruise', title: 'Cruise chapter: Pleasant, Beyond the Shore', links: [['Vendors & quotes', 'vendors'], ['Cabins', 'cabins']], html: `
    <p>A travel-editorial treatment: deep navy, ivory and restrained crimson. No ship image or itinerary implies a selected operator.</p>
    <h3>Open decisions</h3>
    <ul><li>Relationship to the reunion (D004)</li><li>Provider and ship, port, dates and duration (D007)</li><li>Fare and occupancy basis</li><li>Deposit and cancellation terms</li></ul>
    <h3>Process</h3>
    <ol><li>Agree survey and quote criteria (T004).</li><li>Collect interest. Interest is not a booking.</li><li>Request written quotes and compare them on the same basis, stating per person or per cabin and the occupancy assumed.</li><li>Approve terms before anyone pays.</li><li>Record cabins only after provider confirmation.</li></ol>
    <p>Traveller fares belong in the CRM and provider records; the cruise budget tracks organizer commitments only.</p>` },
  { id: 'comms', title: 'Communications and message drafts', links: [['Communications', 'comms']], html: `
    <p>Use the existing Facebook Page and Instagram @mph_classof08. Outreach is free and organic. A Facebook Group would be a new, separate decision. Drafting in the workspace never posts anything; an organizer posts manually after approval.</p>
    <h3>Reusable drafts (v1 handbook text)</h3>
    <div class="template" data-template><div class="tpl-head"><strong>Planning announcement</strong></div><pre>MPHS Class of 2008, we’re planning for our 20-year reunion in 2028. Esaie Touze and the co-lead (name withheld) are helping bring it together, and we want the whole class to have a chance to be part of it. Follow this page for updates and share it with classmates. Dates and details will follow once they’re confirmed.</pre></div>
    <div class="template" data-template><div class="tpl-head"><strong>Memory prompt</strong></div><pre>What takes you straight back to Mount Pleasant in 2008? A song, a hallway, a teacher, a moment. Tell us what you remember. If you have a photo you would like us to consider for the reunion, message the page so we can talk about how you want it used.</pre></div>
    <div class="template" data-template><div class="tpl-head"><strong>Private contact permission</strong></div><pre>Hey [name], we’re helping plan the MPHS Class of 2008 reunion for 2028. Would you like to receive updates? If so, what is the best way to reach you? You can also follow the class pages and share them with anyone from our year.</pre></div>
    <div class="template" data-template><div class="tpl-head"><strong>Cruise interest announcement</strong></div><pre>We’re also exploring a Class of 2008 cruise for 2028. The sailing and costs are still open. Once the committee approves the interest survey, we’ll share it here so classmates can tell us what could work for them.</pre></div>
    <div class="template" data-template><div class="tpl-head"><strong>Sponsor introduction</strong></div><pre>Hi [name], we’re organizing the MPHS Class of 2008 reunion for 2028 and would like to explore whether [business] would be interested in supporting it. We’re still developing the event and sponsor options. May we send you the details once they’re approved?</pre></div>
    <h3>Before a public update</h3>
    <p>Check every date, price, venue, benefit and link against approved records. Remove private classmate information. A committee review of copy does not itself publish or send the message. Do not announce scarcity, ticket availability or benefits before the committee can support those claims.</p>` },
  { id: 'artwork', title: 'Artwork and identity use', links: [], html: `
    <p>Six Midjourney illustrations and the recovered reunion seal are approved for project use (25 Oct 2026). They are illustrations, not archival evidence.</p>
    <ul>
      <li>Do not stretch, recolour or crop the seal into an unrecognisable symbol.</li>
      <li>Do not put essential text over busy imagery. Put dates, links and actions in real, editable text.</li>
      <li>Never label the collage as a yearbook photograph or identify background figures as classmates.</li>
      <li>MPHS identity is independent of S.TOUZE and VXNAIRE. Do not apply either business's brand system.</li>
    </ul>` },
  { id: 'sources', title: 'Sources, tools and sync', links: [], html: `
    <p>The v1 files are planning evidence: two decks, the tracker, the private CRM and this handbook. File links are references; nothing synchronises automatically.</p>
    <ul>
      <li>Two older live CRM versions exist. Neither is authoritative without reconciliation (T006).</li>
      <li>The intended Google destination is owner@example.com. Access is not yet verified (D003, T005). No native import has been made.</li>
      <li>Imports are review operations: validate, preview, report duplicates and keep provenance before applying.</li>
      <li>Transfer verified funding totals between files manually, with a date and reference.</li>
    </ul>` },
  { id: 'closeout', title: 'Closeout', links: [['Closeout checklist', 'closeout']], html: `
    <p>The tracker's closeout deliverables: photo gallery with permission, highlight video with permission, classmate and sponsor thanks, feedback survey, memory book, final financial reconciliation, and a private archive and retention review. All are Not started.</p>
    <p>Agree who keeps the restricted archive, what remains necessary and what should be deleted after the events. Public recap materials should contain only approved images and credits. Before reporting, resolve duplicate transaction IDs and missing payment details, confirm cabin IDs are unique, reconcile receipts to provider or bank records, and check refunds.</p>` },
];
