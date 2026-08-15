// api/festivals.js
// GET  → returns active festival offer for today (public)
// POST { action:'admin_update', ... } → admin manages festival calendar

const { db } = require('./_firebase');

// Pre-loaded festival calendar — admin can edit any of these in Firestore
// Dates use MM-DD format for annual recurrence (year-independent)
const DEFAULT_FESTIVALS = [
  {
    id: 'republic_day',
    name: 'Republic Day',
    emoji: '🇮🇳',
    mmdd: '01-26',
    windowDays: 2,        // offer active for N days around the date
    discountPct: 26,      // 26% off on 26th Jan
    promoCode: 'INDIA26',
    states: [],           // empty = all India
    message: 'Happy Republic Day! 26% off today only.',
    active: true,
  },
  {
    id: 'holi',
    name: 'Holi',
    emoji: '🎨',
    mmdd: '03-14',        // approximate — admin updates yearly
    windowDays: 2,
    discountPct: 20,
    promoCode: 'HOLI20',
    states: ['MH','UP','MP','RJ','DL','HR','PB'],
    message: 'Holi Mubarak! 20% off — colour your future bright.',
    active: true,
  },
  {
    id: 'baisakhi',
    name: 'Baisakhi',
    emoji: '🌾',
    mmdd: '04-13',
    windowDays: 2,
    discountPct: 20,
    promoCode: 'BAISAKHI20',
    states: ['PB','HR','HP','UK'],
    message: 'Happy Baisakhi! 20% off for Punjab and Haryana students.',
    active: true,
  },
  {
    id: 'eid',
    name: 'Eid ul-Fitr',
    emoji: '🌙',
    mmdd: '03-30',        // approximate — lunar, admin updates yearly
    windowDays: 3,
    discountPct: 30,
    promoCode: 'EID30',
    states: [],
    message: 'Eid Mubarak! 30% off — celebrate and keep learning.',
    active: true,
  },
  {
    id: 'eid_adha',
    name: 'Eid ul-Adha',
    emoji: '🌙',
    mmdd: '06-06',
    windowDays: 3,
    discountPct: 25,
    promoCode: 'EIDADHA25',
    states: [],
    message: 'Eid ul-Adha Mubarak! 25% off for all students.',
    active: true,
  },
  {
    id: 'independence_day',
    name: 'Independence Day',
    emoji: '🇮🇳',
    mmdd: '08-15',
    windowDays: 3,
    discountPct: 15,
    promoCode: 'AZADI75',
    states: [],
    message: 'Happy Independence Day! 15% off — free India, free education.',
    active: true,
  },
  {
    id: 'ganesh_chaturthi',
    name: 'Ganesh Chaturthi',
    emoji: '🙏',
    mmdd: '08-27',
    windowDays: 10,       // 10-day festival
    discountPct: 15,
    promoCode: 'GANESHOTSAV15',
    states: ['MH','KA','GJ','TG','AP'],
    message: 'Ganpati Bappa Morya! 15% off — Maharashtra students, this one\'s for you.',
    active: true,
  },
  {
    id: 'navratri',
    name: 'Navratri',
    emoji: '🪔',
    mmdd: '10-02',
    windowDays: 9,
    discountPct: 15,
    promoCode: 'NAVRATRI15',
    states: ['GJ','MH','RJ','MP','UP'],
    message: 'Happy Navratri! 15% off during the 9 nights.',
    active: true,
  },
  {
    id: 'dussehra',
    name: 'Dussehra',
    emoji: '🏹',
    mmdd: '10-11',
    windowDays: 2,
    discountPct: 20,
    promoCode: 'DUSSEHRA20',
    states: [],
    message: 'Happy Dussehra! Evil of expensive education ends today — 20% off.',
    active: true,
  },
  {
    id: 'diwali',
    name: 'Diwali',
    emoji: '🪔',
    mmdd: '11-01',        // approximate — admin updates yearly
    windowDays: 5,
    discountPct: 30,
    promoCode: 'DIWALI30',
    states: [],
    message: 'Diwali Offer! 30% off — biggest discount of the year. Shubh Deepavali!',
    active: true,
    isBiggest: true,
  },
  {
    id: 'guru_nanak',
    name: 'Guru Nanak Jayanti',
    emoji: '✨',
    mmdd: '11-15',
    windowDays: 2,
    discountPct: 15,
    promoCode: 'GURPURAB15',
    states: ['PB','HR','DL','UK'],
    message: 'Waheguru Ji Ka Khalsa! 15% off on Gurpurab.',
    active: true,
  },
  {
    id: 'christmas',
    name: 'Christmas',
    emoji: '🎄',
    mmdd: '12-25',
    windowDays: 3,
    discountPct: 25,
    promoCode: 'XMAS25',
    states: ['KL','GO','MZ','MN'],  // more Christian population
    message: 'Merry Christmas! 25% off — gift yourself a better future.',
    active: true,
  },
  {
    id: 'new_year',
    name: 'New Year',
    emoji: '🎉',
    mmdd: '01-01',
    windowDays: 3,
    discountPct: 20,
    promoCode: 'NY2027',            // admin updates code yearly
    states: [],
    message: 'Happy New Year! 20% off — start 2027 with your NEET prep sorted.',
    active: true,
  },
  {
    id: 'pongal',
    name: 'Pongal',
    emoji: '🌾',
    mmdd: '01-14',
    windowDays: 3,
    discountPct: 20,
    promoCode: 'PONGAL20',
    states: ['TN','AP','TG','KA'],
    message: 'Happy Pongal! 20% off for South India students.',
    active: true,
  },
  {
    id: 'onam',
    name: 'Onam',
    emoji: '🌸',
    mmdd: '09-05',
    windowDays: 10,
    discountPct: 20,
    promoCode: 'ONAM20',
    states: ['KL'],
    message: 'Happy Onam! 20% off for Kerala students.',
    active: true,
  },
  {
    id: 'exam_season',
    name: 'NEET Exam Month',
    emoji: '📚',
    mmdd: '05-01',        // May — NEET month, admin updates yearly
    windowDays: 31,
    discountPct: 50,
    promoCode: 'NEET2026',
    states: [],
    message: 'NEET is this month! 50% off — last chance to unlock full practice.',
    active: true,
    isBiggest: true,
  },
];

// State code to name mapping
const STATE_NAMES = {
  MH:'Maharashtra', UP:'Uttar Pradesh', PB:'Punjab', HR:'Haryana',
  RJ:'Rajasthan', MP:'Madhya Pradesh', GJ:'Gujarat', KA:'Karnataka',
  TN:'Tamil Nadu', AP:'Andhra Pradesh', TG:'Telangana', KL:'Kerala',
  DL:'Delhi', WB:'West Bengal', OR:'Odisha', JH:'Jharkhand',
  UK:'Uttarakhand', HP:'Himachal Pradesh', GO:'Goa', MZ:'Mizoram',
  MN:'Manipur', AS:'Assam',
};

function isActiveToday(festival) {
  if (!festival.active) return false;
  const now = new Date();
  const [mm, dd] = festival.mmdd.split('-').map(Number);
  const festDate = new Date(now.getFullYear(), mm - 1, dd);
  const halfWindow = Math.floor(festival.windowDays / 2);
  const start = new Date(festDate); start.setDate(start.getDate() - 1);
  const end = new Date(festDate); end.setDate(end.getDate() + (festival.windowDays - 1));
  return now >= start && now <= end;
}

function hoursRemaining(festival) {
  const now = new Date();
  const [mm, dd] = festival.mmdd.split('-').map(Number);
  const festDate = new Date(now.getFullYear(), mm - 1, dd);
  const end = new Date(festDate);
  end.setDate(end.getDate() + festival.windowDays);
  end.setHours(23, 59, 59, 999);
  return Math.max(0, Math.round((end - now) / 3600000));
}

module.exports = async function handler(req, res) {

  // GET — return today's active festival offer
  if (req.method === 'GET') {
    try {
      // Load from Firestore (admin may have updated)
      let festivals = DEFAULT_FESTIVALS;
      try {
        const snap = await db.collection('config').doc('festivals').get();
        if (snap.exists && snap.data().list) festivals = snap.data().list;
      } catch(e) {}

      const userState = req.query.state || '';
      const today = new Date();

      // Find active festivals for today (state-filtered)
      const active = festivals.filter(f => {
        if (!isActiveToday(f)) return false;
        if (f.states && f.states.length > 0 && userState) {
          return f.states.includes(userState.toUpperCase());
        }
        return true; // no state filter = all India
      });

      // Pick the biggest discount if multiple active
      const best = active.sort((a, b) => b.discountPct - a.discountPct)[0] || null;

      if (!best) {
        // No active festival — return upcoming
        const upcoming = festivals
          .filter(f => f.active)
          .map(f => {
            const [mm, dd] = f.mmdd.split('-').map(Number);
            const d = new Date(today.getFullYear(), mm - 1, dd);
            if (d < today) d.setFullYear(today.getFullYear() + 1);
            return { ...f, daysUntil: Math.ceil((d - today) / 86400000) };
          })
          .sort((a, b) => a.daysUntil - b.daysUntil)
          .slice(0, 3);

        return res.status(200).json({ active: false, upcoming });
      }

      return res.status(200).json({
        active: true,
        festival: {
          id: best.id,
          name: best.name,
          emoji: best.emoji,
          discountPct: best.discountPct,
          promoCode: best.promoCode,
          message: best.message,
          hoursRemaining: hoursRemaining(best),
          targetedStates: best.states.map(s => STATE_NAMES[s] || s),
          isBiggest: best.isBiggest || false,
        }
      });
    } catch (err) {
      console.error('festivals GET error', err);
      return res.status(200).json({ active: false, upcoming: [] });
    }
  }

  // POST — admin management
  if (req.method === 'POST') {
    const { action, uid, sessionToken } = req.body || {};
    if (!uid || !sessionToken) return res.status(400).json({ error: 'Auth required' });

    const uSnap = await db.collection('users').doc(uid).get();
    if (!uSnap.exists || uSnap.data().role !== 'admin' || uSnap.data().sessionToken !== sessionToken)
      return res.status(403).json({ error: 'Admin only' });

    if (action === 'get_all') {
      try {
        const snap = await db.collection('config').doc('festivals').get();
        const list = snap.exists ? snap.data().list : DEFAULT_FESTIVALS;
        return res.status(200).json({ festivals: list });
      } catch(e) { return res.status(200).json({ festivals: DEFAULT_FESTIVALS }); }
    }

    if (action === 'update_festival') {
      const { festival } = req.body;
      if (!festival || !festival.id) return res.status(400).json({ error: 'festival required' });
      const snap = await db.collection('config').doc('festivals').get();
      let list = snap.exists ? snap.data().list : [...DEFAULT_FESTIVALS];
      const idx = list.findIndex(f => f.id === festival.id);
      if (idx >= 0) list[idx] = { ...list[idx], ...festival };
      else list.push(festival);
      await db.collection('config').doc('festivals').set({ list, updatedAt: new Date().toISOString() });
      return res.status(200).json({ ok: true });
    }

    if (action === 'add_custom') {
      const { festival } = req.body;
      const snap = await db.collection('config').doc('festivals').get();
      let list = snap.exists ? snap.data().list : [...DEFAULT_FESTIVALS];
      list.push({ ...festival, id: 'custom_' + Date.now(), active: true });
      await db.collection('config').doc('festivals').set({ list, updatedAt: new Date().toISOString() });
      return res.status(200).json({ ok: true });
    }

    if (action === 'toggle') {
      const { festivalId, active } = req.body;
      const snap = await db.collection('config').doc('festivals').get();
      let list = snap.exists ? snap.data().list : [...DEFAULT_FESTIVALS];
      const idx = list.findIndex(f => f.id === festivalId);
      if (idx >= 0) list[idx].active = active;
      await db.collection('config').doc('festivals').set({ list, updatedAt: new Date().toISOString() });
      return res.status(200).json({ ok: true });
    }

    if (action === 'reset_defaults') {
      await db.collection('config').doc('festivals').set({ list: DEFAULT_FESTIVALS, updatedAt: new Date().toISOString() });
      return res.status(200).json({ ok: true, message: 'Reset to defaults' });
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
