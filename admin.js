// Initialize Supabase
initSupabase();

let panzoomInstance;
let familyData = null;
let editModal = null;
let currentUser = null;

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    editModal = new bootstrap.Modal(document.getElementById('editModal'));
    
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        const errorDiv = document.getElementById('login-error');
        if (errorDiv) {
            errorDiv.innerText = "Errore: Supabase Client non inizializzato. Controlla la console.";
            errorDiv.classList.remove('d-none');
        }
        return;
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
    
    // JSON Upload listener
    const fileInput = document.getElementById('input-json-file');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileUpload);
    }

    // Backup button listener
    const backupBtn = document.getElementById('btn-create-backup');
    if (backupBtn) {
        backupBtn.addEventListener('click', createBackup);
    }
});

function handleAuthChange(session) {
    const loginContainer = document.getElementById('login-container');
    const adminContent = document.getElementById('admin-content');
    
    if (session) {
        currentUser = session.user;
        const userEmailSpan = document.getElementById('user-email');
        if (userEmailSpan) userEmailSpan.innerText = currentUser.email;
        
        loginContainer.style.display = 'none';
        adminContent.classList.remove('d-none');
        loadData();
    } else {
        currentUser = null;
        loginContainer.style.display = 'block';
        adminContent.classList.add('d-none');
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
        errorDiv.innerText = error.message;
        errorDiv.classList.remove('d-none');
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerText = "Accedi";
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
            .order('created_at', { ascending: true });

        if (error) throw error;
        
        familyData = buildTreeHierarchy(data);
        renderTreeEditor();
    } catch (error) {
        console.error("Could not fetch family data:", error);
    }
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

    let treantNode = {
        children: node.children ? node.children.map(transformAdminData) : []
    };

    const bloodlineActions = `
        <div class="admin-actions">
            <button class="action-btn btn-edit" onclick="editPerson('${node.id}', 'bloodline')" title="Modifica">✎</button>
            ${!node.spouse_data ? `<button class="action-btn btn-spouse" onclick="addSpouse('${node.id}')" title="Aggiungi Coniuge">⚭</button>` : ''}
            <button class="action-btn btn-delete" onclick="deleteNode('${node.id}')" title="Elimina">×</button>
        </div>
    `;

    const mainActions = `
        <div class="admin-main-actions">
            <button class="action-btn btn-child" style="width: 100%; max-width: 150px;" onclick="addChild('${node.id}')" title="Aggiungi Figlio">+ Aggiungi Figlio</button>
        </div>
    `;

    if (node.spouse_data) {
        treantNode.HTMLclass = "node couple-node";
        treantNode.innerHTML = `
            <div class="person-container">
                <div class="person bloodline-person admin-person-card">
                    <p class="node-name">${node.name}</p>
                    <p class="node-contact">${node.contact || ''}</p>
                    ${bloodlineActions}
                </div>
                <div class="spouse-separator"></div>
                <div class="person spouse-person admin-person-card">
                    <p class="node-name">${node.spouse_data.name}</p>
                    ${node.spouse_data.title ? `<p class="node-title">${node.spouse_data.title}</p>` : ''}
                    <p class="node-contact">${node.spouse_data.contact || ''}</p>
                    <div class="admin-actions">
                        <button class="action-btn btn-edit" onclick="editPerson('${node.spouse_data.id}', 'spouse')" title="Modifica">✎</button>
                        <button class="action-btn btn-delete" onclick="deleteNode('${node.spouse_data.id}')" title="Elimina">×</button>
                    </div>
                </div>
            </div>
            ${mainActions}
        `;
    } else {
        treantNode.HTMLclass = "node single-node";
        treantNode.innerHTML = `
            <div class="person single-person bloodline-person admin-person-card">
                <p class="node-name">${node.name}</p>
                <p class="node-contact">${node.contact || ''}</p>
                ${bloodlineActions}
            </div>
            ${mainActions}
        `;
    }

    return treantNode;
}

function renderTreeEditor() {
    const container = document.getElementById('tree-editor-container');
    container.innerHTML = `
        <div class="p-3 text-center border-bottom bg-light">
            <button class="btn btn-primary" onclick="addRoot()">+ Nuovo Capostipite</button>
        </div>
    `;

    if (!familyData || familyData.length === 0) {
        container.innerHTML += `<div class="p-5 text-center text-muted">L'albero è vuoto.</div>`;
        return;
    }
    
    const subContainerId = `admin-tree-main`;
    const subContainer = document.createElement('div');
    subContainer.id = subContainerId;
    subContainer.className = 'treant-instance';
    container.appendChild(subContainer);

    const virtualRoot = {
        HTMLclass: 'virtual-root',
        children: familyData.map(transformAdminData),
        text: { name: 'Virtual Root' }
    };

    const chart_config = {
        chart: {
            container: `#${subContainerId}`,
            levelSeparation: 100,
            siblingSeparation: 50,
            subTeeSeparation: 50,
            rootOrientation: "NORTH",
            nodeAlign: "BOTTOM",
            padding: 35,
            callback: {
                onTreeLoaded: function(tree) {
                    const paths = document.querySelectorAll(`#${subContainerId} svg path`);
                    paths.forEach(path => {
                        const d = path.getAttribute('d');
                        if (d) {
                            const parts = d.split(/[ ,MLZ]/);
                            const y = parseFloat(parts[2]);
                            if (y < 50) {
                                path.style.display = 'none';
                            }
                        }
                    });
                }
            },
            connectors: { type: "step", style: { "stroke-width": 2, "stroke": "#ccc" } }
        },
        nodeStructure: virtualRoot
    };
    new Treant(chart_config);
    initPanzoom(container);
}

function initPanzoom(element) {
    if (panzoomInstance) {
        panzoomInstance.destroy();
    }

    panzoomInstance = Panzoom(element, {
        maxScale: 5,
        minScale: 0.1,
        canvas: true,
        cursor: 'grab',
        filter: (e) => {
            return !e.target.classList.contains('action-btn');
        }
    });

    document.getElementById('zoom-in').addEventListener('click', () => panzoomInstance.zoomIn());
    document.getElementById('zoom-out').addEventListener('click', () => panzoomInstance.zoomOut());
    document.getElementById('zoom-reset').addEventListener('click', () => fitToScreen(element));

    element.parentElement.addEventListener('wheel', (event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        panzoomInstance.zoomWithWheel(event);
    }, { passive: false });

    setTimeout(() => fitToScreen(element), 800);
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

    const padding = 40;
    const scaleX = (parentWidth - padding * 2) / contentWidth;
    const scaleY = (parentHeight - padding * 2) / contentHeight;
    
    let scale = Math.min(scaleX, scaleY);
    scale = Math.min(Math.max(scale, 0.1), 1); 

    panzoomInstance.zoom(scale, { animate: true });
    
    const offsetX = (parentWidth / 2) - (minX + contentWidth / 2) * scale;
    const offsetY = (parentHeight / 2) - (minY + contentHeight / 2) * scale;
    
    panzoomInstance.pan(offsetX, offsetY, { animate: true });
}

// JSON Upload and Backup
async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm("ATTENZIONE: L'importazione sovrascriverà i dati attuali. Vuoi procedere con l'importazione del file JSON locale?")) {
        e.target.value = ''; // Reset input
        return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const json = JSON.parse(event.target.result);
            
            // 1. Create automatic backup before massive change
            await createBackup(false); // Silent backup

            // 2. Clear current data (optional but recommended for fresh import)
            if (confirm("Vuoi svuotare il database prima dell'importazione? (Consigliato per evitare duplicati)")) {
                await supabaseClient.from('family_members').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            }

            // 3. Insert new data
            await performImport(json);
            
            alert("Importazione completata con successo! Un backup è stato creato automaticamente.");
            loadData();
        } catch (error) {
            console.error(error);
            alert("Errore durante l'importazione: " + error.message);
        } finally {
            e.target.value = '';
        }
    };
    reader.readAsText(file);
}

async function performImport(node, parentId = null) {
    // This is a recursive import from the Treant-like JSON structure
    const { data: mainPerson, error: err1 } = await supabaseClient
        .from('family_members')
        .insert([{ name: node.text.name, contact: node.text.contact, parent_id: parentId }])
        .select().single();
    
    if (err1) throw err1;

    if (node.spouse) {
        const { error: err2 } = await supabaseClient
            .from('family_members')
            .insert([{ name: node.spouse.name, contact: node.spouse.contact, title: node.spouse.title, spouse_id: mainPerson.id }]);
        if (err2) throw err2;
    }

    if (node.children) {
        for (const child of node.children) {
            await performImport(child, mainPerson.id);
        }
    }
}

async function createBackup(showConfirm = true) {
    try {
        // Fetch all current data
        const { data, error } = await supabaseClient.from('family_members').select('*');
        if (error) throw error;

        if (data.length === 0 && showConfirm) {
            alert("Nessun dato da salvare nel backup.");
            return;
        }

        // Prepare backup object
        const backup = {
            timestamp: new Date().toISOString(),
            data: data
        };

        // Create a downloadable file for the user
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `family_backup_${new Date().getTime()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (showConfirm) alert("Backup creato e scaricato correttamente.");
    } catch (error) {
        console.error("Errore backup:", error);
        alert("Errore durante la creazione del backup.");
    }
}

// CRUD Operations
window.addRoot = async function() {
    const { error } = await supabaseClient.from('family_members').insert([{ name: "Nuovo Capostipite" }]);
    if (error) alert(error.message);
    else loadData();
}

window.addChild = async function(parentId) {
    const { error } = await supabaseClient.from('family_members').insert([{ name: "Nuovo Figlio", parent_id: parentId }]);
    if (error) alert(error.message);
    else loadData();
}

window.addSpouse = async function(partnerId) {
    const { error } = await supabaseClient.from('family_members').insert([{ name: "Nuovo Coniuge", spouse_id: partnerId, title: "Moglie" }]);
    if (error) alert(error.message);
    else loadData();
}

window.editPerson = async function(id, type) {
    const { data, error } = await supabaseClient.from('family_members').select('*').eq('id', id).single();
    if (error) return;
    
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-type').value = type;
    document.getElementById('input-name').value = data.name;
    document.getElementById('input-contact').value = data.contact || '';
    
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
    const title = document.getElementById('input-title').value;
    
    const updates = { name, contact };
    if (document.getElementById('edit-type').value === 'spouse') {
        updates.title = title;
    }
    
    const { error } = await supabaseClient.from('family_members').update(updates).eq('id', id);
    if (error) alert(error.message);
    else {
        editModal.hide();
        loadData();
    }
}

window.deleteNode = async function(id) {
    if (confirm("Sei sicuro? Se è un membro della linea di sangue, verrà eliminata anche tutta la discendenza.")) {
        const { error } = await supabaseClient.from('family_members').delete().eq('id', id);
        if (error) alert(error.message);
        else loadData();
    }
}
