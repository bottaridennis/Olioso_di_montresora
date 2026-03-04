// Initialize Supabase
initSupabase();

let panzoomInstance;
let familyData = null;
let allMembersFlat = []; // Store for list view and search
let editModal = null;
let adminToast = null;
let currentUser = null;

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    editModal = new bootstrap.Modal(document.getElementById('editModal'));
    
    const toastEl = document.getElementById('adminToast');
    if (toastEl) {
        adminToast = new bootstrap.Toast(toastEl, { delay: 3000 });
    }
    
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        const errorDiv = document.getElementById('login-error');
        if (errorDiv) {
            errorDiv.innerText = "Errore: Supabase Client non inizializzato. Controlla la console.";
            errorDiv.classList.remove('d-none');
        }
        return;
    }

    // Set current date in header
    const dateEl = document.getElementById('current-date');
    if (dateEl) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.innerText = new Date().toLocaleDateString('it-IT', options);
    }

    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        handleAuthChange(session);
    } catch (err) {
        console.error("Errore recupero sessione:", err);
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
        handleAuthChange(session);
    });

    document.getElementById('btn-logout').addEventListener('click', handleLogout);
    document.getElementById('btn-save-modal').addEventListener('click', saveModalData);
    
    // Quick backup from dashboard
    const quickBackupBtn = document.getElementById('btn-quick-backup');
    if (quickBackupBtn) {
        quickBackupBtn.addEventListener('click', () => createBackup());
    }

    // JSON Upload listener
    const fileInput = document.getElementById('input-json-file');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileUpload);
    }

    // List search listener
    const listSearchInput = document.getElementById('admin-search-input');
    if (listSearchInput) {
        listSearchInput.addEventListener('input', (e) => {
            renderListView(e.target.value.toLowerCase().trim());
        });
    }

    // Tree search listener
    const treeSearchInput = document.getElementById('tree-search-input');
    if (treeSearchInput) {
        treeSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            highlightInTree(query);
        });
    }

    // Sidebar navigation
    const menuItems = document.querySelectorAll('.menu-item');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const closeSidebar = document.getElementById('close-sidebar');

    function toggleSidebar() {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }

    if (sidebarToggle) sidebarToggle.addEventListener('click', toggleSidebar);
    if (closeSidebar) closeSidebar.addEventListener('click', toggleSidebar);
    if (overlay) overlay.addEventListener('click', toggleSidebar);

    menuItems.forEach(item => {
        item.addEventListener('click', function() {
            const target = this.getAttribute('data-target');
            if (!target) return; // Exit for external links

            // Close sidebar on mobile after clicking
            if (window.innerWidth <= 992) {
                toggleSidebar();
            }

            // Update active state
            menuItems.forEach(mi => mi.classList.remove('active'));
            this.classList.add('active');

            // Switch views
            document.querySelectorAll('.admin-view').forEach(view => {
                view.classList.add('d-none');
            });
            const targetView = document.getElementById(target);
            if (targetView) targetView.classList.remove('d-none');

            // Update header title
            const title = this.innerText.trim();
            document.getElementById('view-title').innerText = title;

            // Show/Hide tree search
            const treeSearchWrapper = document.getElementById('tree-search-wrapper');
            if (target === 'tree-view') {
                treeSearchWrapper.classList.remove('d-none');
                // Re-render or re-init if needed
                if (panzoomInstance) setTimeout(() => fitToScreen(document.querySelector('.treant-instance')), 100);
            } else {
                treeSearchWrapper.classList.add('d-none');
            }
        });
    });
});

function handleAuthChange(session) {
    const loginScreen = document.getElementById('login-screen');
    const adminWrapper = document.getElementById('admin-wrapper');
    
    if (session) {
        currentUser = session.user;
        const userEmailSpan = document.getElementById('user-email');
        if (userEmailSpan) userEmailSpan.innerText = currentUser.email;
        
        loginScreen.classList.add('d-none');
        adminWrapper.classList.remove('d-none');
        loadData();
    } else {
        currentUser = null;
        loginScreen.classList.remove('d-none');
        adminWrapper.classList.add('d-none');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');
    const loginBtn = e.target.querySelector('button[type="submit"]');
    
    errorDiv.classList.add('d-none');
    loginBtn.disabled = true;
    loginBtn.innerText = "Accesso in corso...";
    
    try {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
    } catch (error) {
        errorDiv.innerText = "Credenziali non valide o errore di rete.";
        errorDiv.classList.remove('d-none');
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerText = "Accedi ora";
    }
}

async function handleLogout() {
    if (supabaseClient) {
        await supabaseClient.auth.signOut();
    }
}

async function loadData() {
    try {
        const { data, error } = await supabaseClient
            .from('family_members')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;
        
        allMembersFlat = data;
        familyData = buildTreeHierarchy(data);
        
        updateDashboardStats();
        renderTreeEditor();
        renderListView();
    } catch (error) {
        console.error("Could not fetch family data:", error);
        showToast("Errore nel caricamento dei dati", "danger");
    }
}

function updateDashboardStats() {
    const total = allMembersFlat.length;
    const bloodline = allMembersFlat.filter(m => !m.spouse_id).length;
    const spouses = allMembersFlat.filter(m => m.spouse_id).length;
    const bios = allMembersFlat.filter(m => m.bio && m.bio.trim().length > 0).length;

    document.getElementById('stat-total').innerText = total;
    document.getElementById('stat-bloodline').innerText = bloodline;
    document.getElementById('stat-spouses').innerText = spouses;
    document.getElementById('stat-bios').innerText = bios;
}

function renderListView(filter = "") {
    const listBody = document.getElementById('admin-list-body');
    if (!listBody) return;

    const filtered = allMembersFlat.filter(m => 
        m.name.toLowerCase().includes(filter) || 
        (m.contact && m.contact.toLowerCase().includes(filter))
    );

    if (filtered.length === 0) {
        listBody.innerHTML = '<tr><td colspan="4" class="text-center py-5 text-muted">Nessun membro trovato.</td></tr>';
        return;
    }

    listBody.innerHTML = filtered.map(m => `
        <tr>
            <td class="px-4">
                <div class="d-flex align-items-center">
                    <div class="rounded-circle bg-light d-flex align-items-center justify-content-center me-3" style="width: 35px; height: 35px;">
                        ${m.spouse_id ? '⚭' : '👤'}
                    </div>
                    <div>
                        <div class="fw-bold">${m.name}</div>
                        <div class="extra-small text-muted">${m.title || (m.spouse_id ? 'Partner' : 'Membro Linea Sangue')}</div>
                    </div>
                </div>
            </td>
            <td>
                <span class="small text-muted">${m.contact || '-'}</span>
            </td>
            <td>
                <span class="badge ${m.spouse_id ? 'bg-soft-orange' : 'bg-soft-blue'} rounded-pill px-3">
                    ${m.spouse_id ? 'Coniuge' : 'Linea Sangue'}
                </span>
            </td>
            <td class="px-4 text-end">
                <div class="d-flex justify-content-end gap-2">
                    <button class="action-btn btn-edit" onclick="editPerson('${m.id}', '${m.spouse_id ? 'spouse' : 'bloodline'}')" title="Modifica"><i class="bi bi-pencil"></i></button>
                    <button class="action-btn btn-delete" onclick="deleteNode('${m.id}')" title="Elimina"><i class="bi bi-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
}

function buildTreeHierarchy(members) {
    if (!members || members.length === 0) return [];
    const map = {};
    members.forEach(m => map[m.id] = { ...m, children: [] });
    let roots = [];
    const spouses = [];
    members.forEach(m => {
        if (m.spouse_id) spouses.push(m);
        else if (!m.parent_id) roots.push(map[m.id]);
    });
    members.forEach(m => {
        if (m.parent_id && !m.spouse_id) {
            if (map[m.parent_id]) map[m.parent_id].children.push(map[m.id]);
        }
    });
    spouses.forEach(s => {
        if (map[s.spouse_id]) map[s.spouse_id].spouse_data = s;
    });
    return roots;
}

function transformAdminData(node) {
    if (!node) return null;

    const isMobile = window.innerWidth <= 992;
    const nodeWidth = isMobile ? 140 : 160;
    const nodeHeight = isMobile ? 125 : 140;
    const separatorWidth = 30;
    const coupleWidth = (nodeWidth * 2) + separatorWidth;

    let treantNode = {
        children: node.children ? node.children.map(transformAdminData) : []
    };

    const bloodlineActions = `
        <div class="admin-actions">
            <button class="action-btn btn-edit" onclick="editPerson('${node.id}', 'bloodline')" title="Modifica"><i class="bi bi-pencil"></i></button>
            ${!node.spouse_data ? `<button class="action-btn btn-spouse" onclick="addSpouse('${node.id}')" title="Aggiungi Partner"><i class="bi bi-plus-circle"></i></button>` : ''}
            <button class="action-btn btn-delete" onclick="deleteNode('${node.id}')" title="Elimina"><i class="bi bi-trash"></i></button>
        </div>
        <div class="admin-actions mt-1" style="opacity: 1">
            <button class="btn btn-child btn-sm w-100 py-0 extra-small" onclick="addChild('${node.id}')">+ Figlio</button>
        </div>
    `;

    if (node.spouse_data) {
        treantNode.HTMLclass = "node couple-node";
        treantNode.width = coupleWidth;
        treantNode.height = nodeHeight;
        treantNode.innerHTML = `
            <div class="person-container">
                <div class="person bloodline-person admin-person-card" data-name="${node.name.toLowerCase()}">
                    <p class="node-name">👤 ${node.name}</p>
                    <p class="node-contact">${node.contact || ''}</p>
                    ${bloodlineActions}
                </div>
                <div class="person spouse-person admin-person-card" data-name="${node.spouse_data.name.toLowerCase()}">
                    <p class="node-name">⚭ ${node.spouse_data.name}</p>
                    ${node.spouse_data.title ? `<p class="node-title small italic text-muted">${node.spouse_data.title}</p>` : ''}
                    <p class="node-contact">${node.spouse_data.contact || ''}</p>
                    <div class="admin-actions">
                        <button class="action-btn btn-edit" onclick="editPerson('${node.spouse_data.id}', 'spouse')" title="Modifica"><i class="bi bi-pencil"></i></button>
                        <button class="action-btn btn-delete" onclick="deleteNode('${node.spouse_data.id}')" title="Elimina"><i class="bi bi-trash"></i></button>
                    </div>
                </div>
            </div>
        `;
    } else {
        treantNode.HTMLclass = "node single-node";
        treantNode.width = nodeWidth;
        treantNode.height = nodeHeight;
        treantNode.innerHTML = `
            <div class="person single-person bloodline-person admin-person-card" data-name="${node.name.toLowerCase()}">
                <p class="node-name">👤 ${node.name}</p>
                <p class="node-contact">${node.contact || ''}</p>
                ${bloodlineActions}
            </div>
        `;
    }

    return treantNode;
}

function renderTreeEditor() {
    const container = document.getElementById('tree-editor-container');
    container.innerHTML = '';

    if (!familyData || familyData.length === 0) {
        container.innerHTML = `
            <div class="d-flex flex-column align-items-center justify-content-center h-100 text-muted">
                <i class="bi bi-tree h1 mb-3 opacity-25"></i>
                <p>L'albero è attualmente vuoto.</p>
                <button class="btn btn-primary fw-bold px-4" onclick="addRoot()">+ Aggiungi il primo Capostipite</button>
            </div>
        `;
        return;
    }
    
    const subContainerId = `admin-tree-main`;
    const subContainer = document.createElement('div');
    subContainer.id = subContainerId;
    subContainer.className = 'treant-instance';
    subContainer.style.width = '100%';
    subContainer.style.height = '100%';
    container.appendChild(subContainer);

    const transformedData = familyData.map(transformAdminData);

    const nodeStructure = transformedData.length > 1 ? {
        HTMLclass: 'virtual-root',
        children: transformedData,
        text: { name: 'Virtual Root' }
    } : (transformedData[0] || null);

    const isMobile = window.innerWidth <= 992;
    const chart_config = {
        chart: {
            container: `#${subContainerId}`,
            levelSeparation: isMobile ? 250 : 300,
            siblingSeparation: isMobile ? 450 : 300,
            subTeeSeparation: isMobile ? 500 : 300,
            rootOrientation: "NORTH",
            nodeAlign: "BOTTOM",
            padding: isMobile ? 60 : 100,
            callback: {
                onTreeLoaded: function(tree) {
                    const paths = document.querySelectorAll(`#${subContainerId} svg path`);
                    paths.forEach(path => {
                        const d = path.getAttribute('d');
                        if (d) {
                            // Estraggo il punto di partenza (y) per nascondere i rami della radice virtuale
                            const match = d.match(/^M\s*([\d.-]+)[\s,]+([\d.-]+)/);
                            if (match) {
                                const y1 = parseFloat(match[2]);
                                // Hide connectors only if a virtual root is being used (more than one root node)
                                if (transformedData.length > 1 && y1 < 50) path.style.display = 'none';
                            }
                        }
                    });
                    
                    setTimeout(() => {
                        if (panzoomInstance) fitToScreen(subContainer);
                    }, 100);
                }
            },
            connectors: { type: "step", style: { "stroke-width": 2, "stroke": "#cbd5e0" } }
        },
        nodeStructure: nodeStructure
    };
    new Treant(chart_config);
    initPanzoom(subContainer);
}

function initPanzoom(element) {
    if (panzoomInstance) {
        panzoomInstance.destroy();
    }

    panzoomInstance = Panzoom(element, {
        maxScale: 5,
        minScale: 0.05,
        canvas: true,
        cursor: 'grab',
        touchAction: 'none',
        filter: (e) => {
            return !e.target.closest('.action-btn') && !e.target.closest('.btn-child');
        }
    });

    document.getElementById('zoom-in').addEventListener('click', () => panzoomInstance.zoomIn({ animate: true }));
    document.getElementById('zoom-out').addEventListener('click', () => panzoomInstance.zoomOut({ animate: true }));
    document.getElementById('zoom-reset').addEventListener('click', () => fitToScreen(element));

    element.addEventListener('wheel', (event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        panzoomInstance.zoomWithWheel(event);
    }, { passive: false });
}

function fitToScreen(element) {
    if (!panzoomInstance) return;

    const parent = element.parentElement;
    const parentWidth = parent.clientWidth;
    const parentHeight = parent.clientHeight;

    const nodes = element.querySelectorAll('.node');
    if (nodes.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    nodes.forEach(node => {
        const rect = node.getBoundingClientRect();
        const containerRect = element.getBoundingClientRect();
        const currentScale = panzoomInstance.getScale();
        
        const left = (rect.left - containerRect.left) / currentScale;
        const top = (rect.top - containerRect.top) / currentScale;
        const width = rect.width / currentScale;
        const height = rect.height / currentScale;

        minX = Math.min(minX, left);
        minY = Math.min(minY, top);
        maxX = Math.max(maxX, left + width);
        maxY = Math.max(maxY, top + height);
    });

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    const padding = 80;
    const scaleX = (parentWidth - padding * 2) / contentWidth;
    const scaleY = (parentHeight - padding * 2) / contentHeight;
    
    let scale = Math.min(scaleX, scaleY);
    // Imposta un limite minimo per la scala automatica (es. 0.5) per mantenere la leggibilità.
    // Se l'albero è troppo grande, verrà centrato ma non rimpicciolito oltre questo limite.
    scale = Math.min(Math.max(scale, 0.5), 1.2); 

    panzoomInstance.zoom(scale, { animate: true });
    
    const offsetX = (parentWidth / 2) - (minX + contentWidth / 2) * scale;
    const offsetY = (parentHeight / 2) - (minY + contentHeight / 2) * scale;
    
    panzoomInstance.pan(offsetX, offsetY, { animate: true });
}

function highlightInTree(query) {
    const cards = document.querySelectorAll('.admin-person-card');
    cards.forEach(card => {
        if (query.length > 1 && card.getAttribute('data-name').includes(query)) {
            card.style.borderColor = '#3498db';
            card.style.boxShadow = '0 0 15px rgba(52, 152, 219, 0.5)';
            card.style.transform = 'scale(1.05)';
        } else {
            card.style.borderColor = '';
            card.style.boxShadow = '';
            card.style.transform = '';
        }
    });
}

function showToast(message, type = 'success') {
    const toastEl = document.getElementById('adminToast');
    const toastMsg = document.getElementById('toast-message');
    if (!toastEl || !toastMsg) return;
    
    toastMsg.innerText = message;
    toastEl.className = `toast border-0 shadow-lg rounded-3 bg-${type === 'success' ? 'success' : 'danger'} text-white`;
    if (adminToast) adminToast.show();
}

// JSON & Backup
async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm("ATTENZIONE: L'importazione sovrascriverà i dati attuali. Vuoi procedere?")) {
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const json = JSON.parse(event.target.result);
            await createBackup(false);
            
            if (confirm("Vuoi svuotare il database prima dell'importazione?")) {
                await supabaseClient.from('family_members').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            }

            // Se è un backup flat (formato creato da createBackup)
            if (json.data && Array.isArray(json.data)) {
                await performFlatImport(json.data);
            } else {
                // Altrimenti è il formato gerarchico (formato family-data.json)
                const dataToImport = Array.isArray(json) ? json : [json];
                for (const node of dataToImport) {
                    if (node && typeof node === 'object') { // Assicura che il nodo sia valido
                        await performImport(node);
                    }
                }
            }
            
            showToast("Importazione completata!");
            loadData();
        } catch (error) {
            console.error("Errore importazione:", error);
            showToast("Errore durante l'importazione", 'danger');
        } finally {
            e.target.value = '';
        }
    };
    reader.readAsText(file);
}

async function performFlatImport(data) {
    // Per un'importazione flat corretta con foreign keys, dovremmo mappare i vecchi ID ai nuovi
    // ma se svuotiamo il DB e gli ID sono UUID, possiamo provare a inserirli direttamente
    // se il backup contiene già gli ID originali.
    
    // Rimuoviamo created_at per evitare conflitti o lasciamo che Supabase lo gestisca
    const cleanData = data.map(({ created_at, ...rest }) => rest);
    
    const { error } = await supabaseClient
        .from('family_members')
        .insert(cleanData);
    
    if (error) throw error;
}

async function performImport(node, parentId = null) {
    // Controllo di sicurezza: esce se il nodo non è valido o non ha la proprietà 'text'
    if (!node || typeof node !== 'object' || !node.text || typeof node.text.name !== 'string') {
        console.warn("Skipping invalid node:", node);
        return;
    }
    const { data: mainPerson, error: err1 } = await supabaseClient
        .from('family_members')
        .insert([{ 
            name: node.text.name, 
            contact: node.text.contact, 
            parent_id: parentId,
            bio: node.text.bio || '',
            title: node.text.title || ''
        }])
        .select().single();
    
    if (err1) throw err1;

    if (node.spouse) {
        const { error: err2 } = await supabaseClient
            .from('family_members')
            .insert([{ 
                name: node.spouse.name, 
                contact: node.spouse.contact, 
                title: node.spouse.title, 
                spouse_id: mainPerson.id,
                bio: node.spouse.bio || ''
            }]);
        if (err2) throw err2;
    }

    // Se ci sono figli, itera e importa ricorsivamente
    if (node.children && node.children.length > 0) {
        for (const child of node.children) {
            // Assicura che il figlio sia un oggetto valido prima di procedere
            if (child && typeof child === 'object') {
                await performImport(child, mainPerson.id);
            }
        }
    }
}

async function createBackup(showConfirm = true) {
    try {
        const { data, error } = await supabaseClient.from('family_members').select('*');
        if (error) throw error;

        const backup = { timestamp: new Date().toISOString(), data: data };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `oliose_backup_${new Date().getTime()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (showConfirm) showToast("Backup scaricato correttamente.");
    } catch (error) {
        showToast("Errore durante il backup", 'danger');
    }
}

// CRUD
window.addRoot = async function() {
    const { error } = await supabaseClient.from('family_members').insert([{ name: "Nuovo Capostipite" }]);
    if (error) showToast(error.message, 'danger');
    else { showToast("Capostipite aggiunto!"); loadData(); }
}

window.addChild = async function(parentId) {
    const { error } = await supabaseClient.from('family_members').insert([{ name: "Nuovo Figlio", parent_id: parentId }]);
    if (error) showToast(error.message, 'danger');
    else { showToast("Figlio aggiunto!"); loadData(); }
}

window.addSpouse = async function(partnerId) {
    const { error } = await supabaseClient.from('family_members').insert([{ name: "Nuovo Partner", spouse_id: partnerId, title: "Moglie" }]);
    if (error) showToast(error.message, 'danger');
    else { showToast("Partner aggiunto!"); loadData(); }
}

window.editPerson = async function(id, type) {
    const { data, error } = await supabaseClient.from('family_members').select('*').eq('id', id).single();
    if (error) return;
    
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-type').value = type;
    document.getElementById('input-name').value = data.name;
    document.getElementById('input-contact').value = data.contact || '';
    document.getElementById('input-bio').value = data.bio || '';
    
    const titleContainer = document.getElementById('title-field-container');
    if (data.spouse_id) {
        titleContainer.classList.remove('d-none');
        document.getElementById('input-title').value = data.title || '';
    } else {
        titleContainer.classList.add('d-none');
    }
    
    editModal.show();
}

async function saveModalData() {
    const id = document.getElementById('edit-id').value;
    const name = document.getElementById('input-name').value;
    const contact = document.getElementById('input-contact').value;
    const bio = document.getElementById('input-bio').value;
    const title = document.getElementById('input-title').value;
    
    if (!name.trim()) { showToast("Il nome è obbligatorio.", 'warning'); return; }

    const saveBtn = document.getElementById('btn-save-modal');
    const originalText = saveBtn.innerText;
    saveBtn.innerText = "Salvataggio...";
    saveBtn.disabled = true;
    
    const updates = { name, contact, bio };
    if (document.getElementById('edit-type').value === 'spouse') updates.title = title;
    
    try {
        const { error } = await supabaseClient.from('family_members').update(updates).eq('id', id);
        if (error) throw error;
        editModal.hide();
        showToast("Dati salvati!");
        loadData();
    } catch (error) {
        showToast("Errore nel salvataggio", 'danger');
    } finally {
        saveBtn.innerText = originalText;
        saveBtn.disabled = false;
    }
}

window.deleteNode = async function(id) {
    if (confirm("Sei sicuro? Se è un membro della linea di sangue, verrà eliminata anche tutta la discendenza.")) {
        const { error } = await supabaseClient.from('family_members').delete().eq('id', id);
        if (error) showToast(error.message, 'danger');
        else { showToast("Membro eliminato."); loadData(); }
    }
}