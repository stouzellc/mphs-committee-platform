// Public, non-private story content, aligned to the v1 deck and handbook text extracts in references/.
// Sources: R = MPHS-Back-to-Pleasant-v1 slide, C = MPHS-Pleasant-Beyond-the-Shore-v1 slide, H = handbook, T = tracker.
// Nothing here is an event booking, price, date or venue.

export const SOCIAL = {
  facebook: 'https://www.facebook.com/profile.php?id=61594970393848',
  instagram: 'https://www.instagram.com/mph_classof08/',
};

export const LEADS = 'Esaie Touze and the co-lead (name withheld)';
export const PEOPLE = [
  ['Esaie Touze', 'Creative direction, sponsorship and key relationships'],
  ['the co-lead (name withheld)', 'Planning, operations, outreach and committee coordination'],
];
export const PEOPLE_NOTE = 'Planning leads. Final role titles and additional committee owners remain open.'; // R11

export const ART = [
  { id: 'mj-1', src: '/art/web/mj-1-960.jpg', thumb: '/art/web/mj-1-480.jpg', w: 960, h: 1200, title: 'The Kiltie, on the big red M', type: 'Mascot portrait', events: ['Reunion'], asset: 'A002',
    alt: 'Illustrated Kiltie mascot in a red tam, red kilt and navy plaid cape, hands on hips, standing in front of a giant crimson M. Decorative lettering reads Once a Kiltie, always a Kiltie.',
    caption: 'Poster-style mascot moment for the reunion story.' },
  { id: 'mj-2', src: '/art/web/mj-2-960.jpg', thumb: '/art/web/mj-2-480.jpg', w: 960, h: 1200, title: 'The Kiltie at rest', type: 'Mascot portrait', events: ['Cruise'], asset: 'A003',
    alt: 'Comic-style Kiltie mascot seated with long dark hair and beard, red cape and blue jacket, both hands resting on a sword, with a misty school building and stadium lights behind.',
    caption: 'Supporting class-identity illustration.' },
  { id: 'mj-3', src: '/art/web/mj-3-960.jpg', thumb: '/art/web/mj-3-480.jpg', w: 960, h: 1200, title: 'Twenty years on', type: 'Mascot portrait', events: ['Cruise', 'Reunion'], asset: 'A004',
    alt: 'Cinematic portrait of a bearded Kiltie figure in a red and blue uniform with medals and a 20 years patch, kneeling, with a stormy school building in the background.',
    caption: 'Dramatic cover portrait used for Pleasant, Beyond the Shore.' },
  { id: 'mj-4', src: '/art/web/mj-4-960.jpg', thumb: '/art/web/mj-4-480.jpg', w: 960, h: 1200, title: 'The Kiltie, sword drawn', type: 'Mascot portrait', events: ['Cruise'], asset: 'A005',
    alt: 'Comic-style standing Kiltie mascot holding a sword across his body, wearing a blue cape with an MPHS crest, with misty school towers behind.',
    caption: 'Chapter illustration.' },
  { id: 'mj-5', src: '/art/web/mj-5-960.jpg', thumb: '/art/web/mj-5-480.jpg', w: 960, h: 1200, title: 'Class of 2008, twenty years later', type: 'Memories collage', events: ['Reunion'], asset: 'A006',
    alt: 'Collage of 2008-era memories: a paper sign reading Class of 2008, 20 years later, 2008 to 2028, surrounded by lockers, handwritten notes, group photos, a graduation cap, an MP3 player and a navy varsity jacket with a red M.',
    caption: 'Memories collage. An illustration, not a yearbook page; writing in the image is decorative.' },
  { id: 'mj-6', src: '/art/web/mj-6-960.jpg', thumb: '/art/web/mj-6-480.jpg', w: 960, h: 1200, title: 'The varsity jacket', type: 'Memories collage', events: ['Reunion'], asset: 'A007',
    alt: 'Close-up of the back of a navy varsity jacket with a crimson MP monogram and the words Class of 2008, 20 years later, 2008 to 2028, with a flip phone, earbuds and handwritten notes around it.',
    caption: 'Opening texture for Back to Pleasant.' },
  { id: 'seal', src: '/art/web/seal-600.png', thumb: '/art/web/seal-600.png', w: 600, h: 600, title: '20-year reunion seal', type: 'Identity', events: ['Reunion', 'Cruise'], asset: 'A001',
    alt: 'Circular 20th-year reunion seal: Mount Pleasant High School, the MP monogram above a brick collegiate building, a Kiltie mascot with a sword, Providence Rhode Island, Est. 1926, Class of 2008, 2028.',
    caption: 'Identity anchor recovered from the v1 source deck. Shown at original proportions.' },
];
export const art = (id) => ART.find((a) => a.id === id);

// Tracker Program rows 7-15, grouped by the four parts on reunion deck slide 5.
const G = {
  arrive: ['Arrival and reconnection', 'A welcome space, class photos and time to catch up.'],
  dinner: ['Dinner and memories', 'A shared meal with a short school memories feature.'],
  recog: ['Recognition', 'Teacher appreciation and a considerate memorial moment.'],
  music: ['Music and celebration', 'Dancing, a group photo and a close that feels unhurried.'],
};
export const PROGRAM = [
  ['Arrival and photos', G.arrive], ['Welcome', G.arrive], ['Dinner', G.dinner], ['School memories', G.dinner],
  ['Teacher appreciation', G.recog], ['Memorial tribute', G.recog], ['Awards', G.recog], ['Dancing', G.music], ['Group photo', G.music],
];
export const PROGRAM_GROUPS = Object.values(G);

export const KNOWN = [ // R3 "Established context"
  ['MPHS Class of 2008, planning for 2028', 'Reunion deck v1, slide 3'],
  [`${LEADS} lead planning`, 'Deck slide 3 · titles pending (D008)'],
  ['Reunion and cruise have separate presentations', 'Decision D002, approved 25 Oct 2026'],
  ['Facebook Page and Instagram already exist', 'Deck slide 9 · @mph_classof08'],
  ['Outreach is free and organic', 'Handbook: project facts'],
];
export const OPEN_REUNION = ['Date, venue and capacity', 'Budget, ticket prices and payment terms', 'How the two experiences connect', 'Approved registration and ticketing path']; // R3

export const DATE_VENUE = [ // R6
  ['Date window', 'Classmate availability and venue availability'],
  ['Room and location', 'Accessibility, capacity and transport options'],
  ['Complete quote', 'Food, service, taxes, insurance and setup costs'],
  ['Booking terms', 'Deposit, cancellation terms and written approval'],
];

export const BUDGET = [ // R7; the contingency rate is a source assumption, not approved policy
  ['Event costs', 'Venue, food, entertainment, media and essential operations.'],
  ['Funding', 'Ticket revenue and committed sponsors, tracked separately from cash received.'],
  ['Contingency', 'The source uses 12.5%. Keep it as a planning assumption until approved.'],
  ['Affordability', 'Compare the full cost and expected attendance before selecting ticket tiers.'],
];

export const NEXT_REUNION = ['Choose the date window and venue criteria', 'Confirm how the cruise connects', 'Assign the first committee responsibilities']; // R14

export const CLASS_PAGES = 'The Facebook Page and Instagram are the public starting point: a clear introduction, a pinned update, shareable memories and invitations for classmates to pass the page along. Confirmed details are posted there first.'; // R9

export const CRUISE_IDENTITY = 'The same Pleasant pride, in a different setting. Class gatherings and keepsakes can follow once the sailing and provider permissions are confirmed.'; // C10

export const ROADMAP = [ // R12
  ['Foundation', 'Confirm roles, roster source and event relationship'],
  ['Date and venue', 'Compare options and approve the full budget'],
  ['Launch', 'Confirm ticketing, terms and public announcement'],
  ['Production', 'Book approved vendors and finalize program'],
  ['Closeout', 'Share approved memories and reconcile finances'],
];

export const DETAILS = ['Yearbook wall', 'Then and now portraits', 'A class playlist', 'A memory book to keep']; // R13

export const CONTRIB = [ // R8
  ['Attend', 'Registration opens after the details and terms are approved.', SOCIAL.facebook, 'Follow the class pages for updates'],
  ['Help plan', 'Committee roles remain available for classmates who want to contribute.', SOCIAL.facebook, 'Message the Facebook Page'],
  ['Share a memory', 'Stories and photos can become part of the celebration with permission.', '#/me', 'Share a memory (committee)'],
  ['Support the event', 'Alumni businesses can explore sponsorship when benefits and terms are set.', SOCIAL.facebook, 'Contact the planning team'],
];

export const STEPS = [ // C7 stages, with H "Interest and affordability" and "Bookings and cabins"
  { name: 'Interested', means: 'A classmate indicates that they may want to travel.', not: 'A booking, a payment or confirmed attendance.', who: 'You, through the classmate area.' },
  { name: 'Offer reviewed', means: 'A verified quote and terms are available to compare.', not: 'That anything is reserved. Quotes change and expire.', who: 'Organizers, against agreed quote criteria.' },
  { name: 'Booked', means: 'The provider confirms a booking and a cabin identifier.', not: 'Two roommates counting as two cabins.', who: 'The provider confirms; organizers record the Cabin ID.' },
  { name: 'Payments', means: 'The ledger records confirmed payments and refunds.', not: 'That a past deposit is still held after a refund.', who: 'Booking responsibilities and payment process are pending.' },
];

export const SURVEY = [ // C4
  ['Availability', 'Ask which travel windows classmates could consider.'],
  ['Total spend', 'Ask for a comfortable all-in budget range without promising a fare.'],
  ['Travel needs', 'Understand departure constraints and accessibility questions privately.'],
  ['Interest', 'Keep an expression of interest separate from a booking or payment.'],
];

export const COST_PARTS = [ // C6
  ['Cruise quote', 'Fare, taxes, fees and the required occupancy basis.'],
  ['Travel to the port', 'Transport, possible lodging and transfers.'],
  ['Onboard spending', 'Confirm gratuities and which activities or packages cost extra.'],
  ['Group event costs', 'Separate class programming and merchandise from the cruise fare.'],
];

export const QUOTE_FIELDS = ['Provider & ship', 'Dates & port', 'Duration', 'Price basis & occupancy', 'Inclusions', 'Other costs', 'Deposit & balance deadline', 'Changes & cancellation', 'Class programming']; // H quote items

export const QUESTIONS = [
  ['Which cruise line and ship?', 'Not chosen. Organizers will compare written offers against agreed quote criteria before recommending anything. Nothing here implies a selected operator.'],
  ['When, from where, and for how long?', 'Sailing date, departure port and duration are pending. The interest survey will ask which travel windows could work for you.'],
  ['What will it cost?', 'Unknown until verified quotes arrive. Prices will be labelled per person or per cabin with the occupancy assumed, and travel to the port, gratuities and class programming will be shown separately.'],
  ['Deposits, changes and cancellations', 'Set by the provider and still pending. A comparable offer records the deposit, balance deadline, changes and cancellation rules.'],
  ['Travel documents', 'Verify the provider’s requirements once the itinerary is known. Share booking documents directly through the provider’s approved process. Passport documents stay outside the shared committee workbook.'],
  ['Accessibility', 'Ask the provider about specific needs before booking. Organizers handle accessibility questions privately.'],
  ['Insurance', 'Review current coverage options and exclusions with the provider.'],
  ['Is the cruise instead of the reunion, or as well?', 'That is still to be decided: a companion trip or an alternative experience. The survey will also ask whether you expect to attend the reunion.'],
];

export const CRUISE_NEXT = [ // C11
  ['Relationship to reunion', 'Clear expectations for classmates'],
  ['Interest survey', 'Availability and affordability information'],
  ['Quote criteria', 'Comparable written provider offers'],
  ['Booking responsibilities', 'A clear owner and private payment process'],
];

export const REUNION_SLIDES = [
  { layout: 'split', art: 'mj-6', k: 'Mount Pleasant High School · Class of 2008', h: 'Back to <span class="accent">Pleasant</span>', p: '20 year reunion planning for 2028.',
    notes: 'Open with the creative title. This is a planning presentation: date, venue and tickets are pending.' },
  { layout: 'center', k: 'The people we remember', h: 'Room for <span class="accent">everyone’s</span> story', p: 'The hallway conversations. The music. The people who made school feel like ours.',
    notes: 'From deck v1 slide 2. Keep it warm; avoid implying a date.' },
  { layout: 'list', k: 'What we know and what comes next', h: 'Known <span class="accent">&amp; open</span>', list: 'knownopen',
    notes: 'Each known item has a source. Open decisions stay Pending until approved in the Decisions register.' },
  { layout: 'split', art: 'mj-1', k: 'Once a Kiltie, always a Kiltie', h: 'Varsity <span class="accent">character</span>', p: 'A grown-up celebration. School memories sit beside the lives we’ve built since 2008.',
    notes: 'The seal anchors the identity; the mascot artwork is user-created with Midjourney and approved for this project.' },
  { layout: 'list', k: 'The proposed reunion experience', h: 'A flexible <span class="accent">program</span>', list: 'groups',
    notes: 'Shape around the venue and budget. Every segment is a proposal; times and owners are pending.' },
  { layout: 'list', k: 'The date and venue decision', h: 'What we need <span class="accent">to choose</span>', list: 'datevenue',
    notes: 'From deck v1 slide 6. No date or venue has been chosen.' },
  { layout: 'list', k: 'A complete estimate comes before ticket prices', h: 'The reunion <span class="accent">budget</span>', list: 'budget',
    notes: 'From deck v1 slide 7. The 12.5% contingency is the source’s planning assumption, not approved policy.' },
  { layout: 'list', k: 'Classmates can choose how to take part', h: 'Ways to <span class="accent">join in</span>', list: 'contribute',
    notes: 'Registration opens only after details and terms are approved.' },
  { layout: 'center', k: 'The class pages', h: 'Facebook Page and <span class="accent">@mph_classof08</span>', p: 'The public starting point. Free, organic outreach: a clear introduction, a pinned update, shareable memories and invitations to pass the page along.',
    notes: 'From deck v1 slide 9.' },
  { layout: 'split', art: 'mj-5', k: 'A class directory with care', h: '318 <span class="accent">names</span>', p: '318 classmates on our starting list. We’re still checking it against the yearbook. Personal details stay private.',
    notes: 'A name on the list does not establish permission to contact, an RSVP or a ticket sale. The collage is an illustration.' },
  { layout: 'list', k: 'The people making it happen', h: 'Planning <span class="accent">leads</span>', list: 'people',
    notes: 'Final role titles and additional committee owners remain open.' },
  { layout: 'list', k: 'The planning sequence', h: 'Five <span class="accent">stages</span>', list: 'roadmap',
    notes: 'Foundation comes first: roles, roster source and the event relationship.' },
  { layout: 'list', k: 'The details that make it ours', h: 'Ideas for <span class="accent">review</span>', list: 'details',
    notes: 'Subject to budget and permission.' },
  { layout: 'split', art: 'seal', k: 'Back to Pleasant', h: 'The next <span class="accent">decisions</span>', p: 'Choose the date window and venue criteria. Confirm how the cruise connects. Assign the first committee responsibilities.',
    notes: 'Close on the seal. Confirmed details will be posted on the Facebook Page and Instagram.' },
];

export const CRUISE_SLIDES = [
  { layout: 'split', art: 'mj-3', k: 'Mount Pleasant High School · Class of 2008', h: '<em>Pleasant,</em><br>Beyond the Shore', p: 'A separate cruise concept for 2028.',
    notes: 'Set expectations early: no provider, ship, port or sailing has been chosen.' },
  { layout: 'center', k: 'More time together', h: 'The conversations that don’t fit into <em>one evening</em>', p: 'A shared trip is a possibility for classmates who want to reconnect over several days.',
    notes: 'From deck v1 slide 2.' },
  { layout: 'list', k: 'The class chooses the shape of the trip', h: 'Ask <em>first</em>', list: 'survey',
    notes: 'Survey criteria still need committee approval (T004).' },
  { layout: 'list', k: 'Interest becomes a booking in stages', h: 'Four <em>stages</em>', list: 'steps',
    notes: 'An expression of interest is separate from a booking or payment.' },
  { layout: 'list', k: 'The full cost of joining', h: 'Per person <em>or</em> per cabin', list: 'cost',
    notes: 'Always label the basis and occupancy. Do not quote prices before written offers exist.' },
  { layout: 'center', k: 'Cabins and travel coordination', h: 'One cabin record. <em>Separate travelers.</em>', p: 'A cabin identifier prevents double counting. Provider confirmation comes before a booking is marked complete.',
    notes: 'Roommates confirm directly; their details stay private.' },
  { layout: 'center', k: 'Class identity, with room to breathe', h: 'The same Pleasant pride. <em>A different setting.</em>', p: 'Class gatherings and keepsakes can follow once the sailing and provider permissions are confirmed.',
    notes: 'From deck v1 slide 10.' },
  { layout: 'list', k: 'The next cruise decisions', h: 'What each decision <em>unlocks</em>', list: 'next',
    notes: 'Relationship to the reunion comes first (D004).' },
  { layout: 'split', art: 'mj-2', k: 'Pleasant, Beyond the Shore', h: 'The class <em>comes first</em>', p: 'Approved updates on the existing Facebook Page and Instagram. Booking details follow a confirmed offer.',
    notes: 'Close by pointing to the class pages and the classmate area.' },
];
