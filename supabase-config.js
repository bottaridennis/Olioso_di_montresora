const SUPABASE_URL = 'https://eerzmtsriphjodwrmetb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlcnptdHNyaXBoam9kd3JtZXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzI3ODcsImV4cCI6MjA4NzU0ODc4N30.l_xzM68SsoTuRIbFc6lM8lhC42sWEyTlXPcUz6QcLcw';

let supabaseClient;

function initSupabase() {
    if (typeof supabase !== 'undefined') {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
        console.error("Supabase SDK not loaded! Assicurati che lo script di Supabase sia caricato prima di questo.");
    }
}
