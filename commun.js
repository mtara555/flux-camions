// =====================================================================
//  FLUX CAMIONS — Fonctions communes à toutes les pages
// =====================================================================
const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  db: { schema: CONFIG.SCHEMA },
  auth: { persistSession: true, autoRefreshToken: true }
});

const App = {
  profil: null,

  // Page d'arrivée selon le rôle (les écrans des étapes suivantes seront ajoutés ici)
  PAGES: {
    responsable: 'securite.html',
    securite:    'securite.html',
    chef_frais:  'equipe.html',
    chef_pgc:    'equipe.html',
    ecran:       'ecran.html'
  },

  // Liens de navigation entre écrans (responsable uniquement)
  navigation(courante) {
    const zone = document.getElementById('nav');
    if (!zone || !App.profil || App.profil.role !== 'responsable') return;
    const pages = [['securite.html', 'Portail'], ['equipe.html', 'Équipes'], ['ecran.html', 'Grand écran'], ['qr.html', 'Affiche QR']];
    zone.innerHTML = pages.filter(([p]) => p !== courante)
      .map(([p, lib]) => `<a class="btn-lien" href="${p}">${lib}</a>`).join('');
  },

  ROLES: {
    responsable: 'Responsable réception',
    securite: 'Agent de sécurité',
    chef_frais: 'Chef d\'équipe Frais',
    chef_pgc: 'Chef d\'équipe PGC/NF',
    ecran: 'Grand écran'
  },

  async chargerProfil() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const { data, error } = await sb.from('profils').select('*').eq('id', session.user.id).maybeSingle();
    if (error || !data || !data.actif) return null;
    return data;
  },

  // Protège une page : redirige vers la connexion si pas de session ou mauvais rôle
  async exigerConnexion(rolesAutorises) {
    const profil = await App.chargerProfil();
    if (!profil) {
      await sb.auth.signOut();
      location.replace('index.html');
      return null;
    }
    if (rolesAutorises && profil.role !== 'responsable' && !rolesAutorises.includes(profil.role)) {
      location.replace('index.html?e=role');
      return null;
    }
    App.profil = profil;
    return profil;
  },

  async deconnexion() {
    await sb.auth.signOut();
    location.replace('index.html');
  },

  async rpc(nom, args) {
    const { data, error } = await sb.rpc(nom, args || {});
    if (error) throw error;
    return data;
  },

  // --- Formatage -------------------------------------------------------
  hhmm(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Casablanca' }).replace(':', 'h');
  },
  jourCourt(d) {
    if (!d) return '';
    const [y, m, j] = String(d).split('-');
    return `${j}/${m}`;
  },
  minutesDepuis(ts) {
    if (!ts) return 0;
    return Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
  },
  duree(min) {
    if (min == null) return '—';
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
  },
  echapper(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  debutJour() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  },

  // --- Messages ----------------------------------------------------------
  toast(msg, type = 'ok') {
    let zone = document.getElementById('toasts');
    if (!zone) {
      zone = document.createElement('div');
      zone.id = 'toasts';
      document.body.appendChild(zone);
    }
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    zone.appendChild(t);
    setTimeout(() => t.classList.add('sortie'), 3500);
    setTimeout(() => t.remove(), 4000);
  },
  erreur(e) {
    const msg = (e && (e.message || e.error_description)) || String(e);
    const lisible = {
      'Invalid login credentials': 'Email ou mot de passe incorrect',
      'Failed to fetch': 'Pas de connexion internet',
      'JWT expired': 'Session expirée, reconnectez-vous'
    }[msg] || msg;
    App.toast(lisible, 'err');
    console.error(e);
  },

  // --- Temps réel : recharge (anti-rebond) à chaque changement ------------
  ecouter(tables, rappel) {
    let minuteur = null;
    const declencher = () => { clearTimeout(minuteur); minuteur = setTimeout(rappel, 300); };
    const canal = sb.channel('flux-' + Math.random().toString(36).slice(2));
    tables.forEach(t => canal.on('postgres_changes', { event: '*', schema: CONFIG.SCHEMA, table: t }, declencher));
    canal.subscribe(statut => {
      const pastille = document.getElementById('pastille-direct');
      if (pastille) pastille.classList.toggle('actif', statut === 'SUBSCRIBED');
    });
    return canal;
  }
};
