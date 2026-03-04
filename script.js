let panzoomInstance;
let allMembers = []; // Store flat list for search
let detailsModal;

// Initialize Supabase
initSupabase();

document.addEventListener('DOMContentLoaded', () => {
    detailsModal = new bootstrap.Modal(document.getElementById('detailsModal'));
    initTree();
    
    // Listen for orientation change
    const orientationSelect = document.getElementById('tree-orientation');
    if (orientationSelect) {
        orientationSelect.addEventListener('change', () => {
            const container = document.getElementById('family-tree');
            if (container) {
                container.innerHTML = '';
                initTree();
            }
            // Listen for legend toggle
    const legendToggle = document.getElementById('toggle-legend');
    const infoPanel = document.getElementById('info-panel');
    if (legendToggle && infoPanel) {
        legendToggle.addEventListener('click', () => {
            infoPanel.classList.toggle('d-none');
            infoPanel.classList.toggle('d-md-block');
        });
    }
});
    }

    // Listen for generation filter
    const genFilter = document.getElementById('gen-filter');
    const genValue = document.getElementById('gen-value');
    if (genFilter) {
        genFilter.addEventListener('input', (e) => {
            const val = e.target.value;
            if (genValue) genValue.innerText = val;
        });
        genFilter.addEventListener('change', () => {
            const container = document.getElementById('family-tree');
            if (container) {
                container.innerHTML = '';
                initTree();
            }
        });
    }
});

// Function to load the family data from Supabase
async function loadFamilyData() {
    try {
        if (!supabaseClient) {
            console.error("supabaseClient non inizializzato");
            return null;
        }
        const { data, error } = await supabaseClient
            .from('family_members')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) throw error;
        
        allMembers = data; // Cache for search
        updateStats();
        return buildTreeHierarchy(data);
    } catch (error) {
        console.error("Could not fetch family data from Supabase:", error);
    }
}

function updateStats() {
    const statsContainer = document.getElementById('family-stats');
    if (!statsContainer) return;

    const total = allMembers.length;
    const bloodlineCount = allMembers.filter(m => !m.spouse_id).length;
    const spousesCount = allMembers.filter(m => m.spouse_id).length;

    statsContainer.innerHTML = `
        <div class="d-flex justify-content-between">
            <span>Totale persone:</span>
            <span class="fw-bold text-dark">${total}</span>
        </div>
        <div class="d-flex justify-content-between">
            <span>Linea di sangue:</span>
            <span class="fw-bold text-dark">${bloodlineCount}</span>
        </div>
        <div class="d-flex justify-content-between">
            <span>Coniugi:</span>
            <span class="fw-bold text-dark">${spousesCount}</span>
        </div>
    `;
}

// Function to build the tree hierarchy from a flat list
function buildTreeHierarchy(members) {
    if (!members || members.length === 0) return [];

    const map = {};
    members.forEach(m => {
        map[m.id] = { ...m, children: [] };
    });

    let roots = [];
    const spouses = [];

    members.forEach(m => {
        if (m.spouse_id) {
            spouses.push(m);
        } else if (!m.parent_id) {
            roots.push(map[m.id]);
        }
    });

    members.forEach(m => {
        if (m.parent_id && !m.spouse_id) {
            if (map[m.parent_id]) {
                map[m.parent_id].children.push(map[m.id]);
            }
        }
    });

    spouses.forEach(s => {
        if (map[s.spouse_id]) {
            map[s.spouse_id].spouse = {
                name: s.name,
                contact: s.contact,
                title: s.title
            };
            map[s.spouse_id].spouse_id = s.id; // Store ID for modal
        }
    });

    return roots;
}

// Function to transform my internal data to Treant format
function transformData(node, currentLevel = 0, maxLevel = 10) {
    if (!node || currentLevel >= maxLevel) return null;

    let treantNode = {
        text: {
            name: node.name,
            contact: node.contact
        },
        children: (node.children && currentLevel < maxLevel - 1) 
            ? node.children.map(child => transformData(child, currentLevel + 1, maxLevel)).filter(n => n !== null) 
            : []
    };

    if (node.spouse) {
        treantNode.HTMLclass = "node couple-node";
        treantNode.width = 390; // 180 + 30 + 180
        treantNode.height = 80;
        treantNode.data = { id: node.id };
        treantNode.innerHTML = `
            <div class="person-container" data-id="${node.id}">
                <div class="person bloodline-person" onclick="showMemberDetails('${node.id}')">
                    <p class="node-name"><span class="node-icon">👤</span>${node.name}</p>
                    <p class="node-contact">${node.contact || ''}</p>
                </div>
                <div class="person spouse-person" data-id="${node.spouse_id || ''}" onclick="event.stopPropagation(); showMemberDetails('${node.spouse_id || ''}')">
                    <p class="node-name"><span class="node-icon">⚭</span>${node.spouse.name}</p>
                    ${node.spouse.title ? `<p class="node-title">${node.spouse.title}</p>` : ''}
                    <p class="node-contact">${node.spouse.contact || ''}</p>
                </div>
            </div>
        `;
    } else {
        treantNode.HTMLclass = "node single-node";
        treantNode.width = 180;
        treantNode.height = 80;
        treantNode.data = { id: node.id };
        treantNode.innerHTML = `
            <div class="person single-person bloodline-person" data-id="${node.id}" onclick="showMemberDetails('${node.id}')">
                <p class="node-name"><span class="node-icon">👤</span>${node.name}</p>
                <p class="node-contact">${node.contact || ''}</p>
            </div>
        `;
    }

    return treantNode;
}

function showMemberDetails(id) {
    if (!id) return;
    const member = allMembers.find(m => m.id === id || m.id == id);
    if (!member) return;

    document.getElementById('modal-name').innerText = member.name;
    document.getElementById('modal-contact').innerText = member.contact || 'Nessuna data registrata';
    document.getElementById('modal-bio').innerText = member.bio || '';
    
    const extraInfo = document.getElementById('modal-extra-info');
    if (member.title) {
        extraInfo.innerHTML = `<strong>Ruolo:</strong> ${member.title}`;
        extraInfo.classList.remove('d-none');
    } else {
        extraInfo.classList.add('d-none');
    }

    detailsModal.show();
    
    // Auto center on the member when viewing details
    setTimeout(() => focusOnMember(id, false), 300);
}

// Function to initialize the tree
async function initTree() {
    const roots = await loadFamilyData();
    const container = document.getElementById('family-tree');
    if (!roots || roots.length === 0) {
        container.innerHTML = '<div class="p-5 text-center text-muted">Nessun dato trovato nel database.</div>';
        return;
    }

    container.innerHTML = ''; 

    const maxGen = parseInt(document.getElementById('gen-filter')?.value || "10");

    const subContainerId = `tree-instance-main`;
    const subContainer = document.createElement('div');
    subContainer.id = subContainerId;
    subContainer.className = 'treant-instance';
    subContainer.style.width = '100%';
    subContainer.style.height = '100%';
    container.appendChild(subContainer);

    const virtualRoot = {
        HTMLclass: 'virtual-root',
        children: roots.map(root => transformData(root, 0, maxGen)).filter(n => n !== null),
        text: { name: 'Virtual Root' }
    };

    const orientation = document.getElementById('tree-orientation')?.value || "NORTH";

    const chart_config = {
        chart: {
            container: `#${subContainerId}`,
            levelSeparation: orientation === "NORTH" ? 150 : 200,
            siblingSeparation: orientation === "NORTH" ? 100 : 80,
            subTeeSeparation: 100,
            rootOrientation: orientation,
            nodeAlign: "BOTTOM",
            padding: 50,
            callback: {
                onTreeLoaded: function(tree) {
                    const paths = document.querySelectorAll(`#${subContainerId} svg path`);
                    const orientation = document.getElementById('tree-orientation')?.value || "NORTH";
                    
                    paths.forEach(path => {
                        const d = path.getAttribute('d');
                        if (d) {
                            // Estraggo le coordinate del punto di partenza (M x y)
                            const match = d.match(/^M\s*([\d.-]+)[\s,]+([\d.-]+)/);
                            if (match) {
                                const x1 = parseFloat(match[1]);
                                const y1 = parseFloat(match[2]);
                                
                                if (orientation === "NORTH") {
                                    if (y1 < 50) path.style.display = 'none';
                                } else {
                                    // WEST orientation: starting point is X
                                    if (x1 < 50) path.style.display = 'none';
                                }
                            }
                        }
                    });
                    
                    // Adatta la vista non appena l'albero è caricato
                    setTimeout(() => {
                        if (panzoomInstance) {
                            fitToScreen(subContainer);
                        }
                    }, 100);
                }
            },
            connectors: {
                type: "step",
                style: {
                    "stroke-width": 2,
                    "stroke": "#adb5bd",
                    "stroke-dasharray": orientation === "NORTH" ? "" : "2,2", // Example difference
                    "arrow-end": "block-wide-long"
                }
            }
        },
        nodeStructure: virtualRoot
    };

    new Treant(chart_config);
    initPanzoom(subContainer);
    initSearch();
}

function initSearch() {
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    
    if (!searchInput || !searchResults) return;

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (query.length < 2) {
            searchResults.classList.add('d-none');
            return;
        }

        const filtered = allMembers.filter(m => 
            m.name.toLowerCase().includes(query) || 
            (m.contact && m.contact.toLowerCase().includes(query))
        );

        if (filtered.length > 0) {
            searchResults.innerHTML = filtered.map(m => `
                <div class="search-item p-2 border-bottom cursor-pointer hover-bg-light" data-id="${m.id}">
                    <div class="fw-bold small">${m.name}</div>
                    <div class="text-muted extra-small">${m.contact || ''}</div>
                </div>
            `).join('');
            searchResults.classList.remove('d-none');
            
            // Add click events to items
            searchResults.querySelectorAll('.search-item').forEach(item => {
                item.addEventListener('click', () => {
                    const id = item.getAttribute('data-id');
                    focusOnMember(id);
                    searchInput.value = '';
                    searchResults.classList.add('d-none');
                });
            });
        } else {
            searchResults.innerHTML = '<div class="p-2 text-muted small">Nessun risultato trovato</div>';
            searchResults.classList.remove('d-none');
        }
    });

    // Close search results when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.add('d-none');
        }
    });
}

function focusOnMember(id, shouldHighlight = true) {
    if (!panzoomInstance) return;

    const member = allMembers.find(m => m.id === id || m.id == id);
    if (!member) return;

    // Search for the element with the correct data-id attribute
    let targetElement = document.querySelector(`[data-id="${id}"]`);
    
    // If not found by data-id (e.g. spouse in a couple node might be tricky depending on how Treant renders)
    // Fallback to text search if needed, but data-id should work
    if (!targetElement) {
        const nodes = document.querySelectorAll('.node');
        nodes.forEach(node => {
            if (node.textContent.includes(member.name)) {
                targetElement = node;
            }
        });
    }

    if (targetElement) {
        // Find the actual .node parent if we clicked a child
        const targetNode = targetElement.closest('.node') || targetElement;
        
        const subContainer = document.querySelector('.treant-instance');
        if (!subContainer) return;
        
        const parent = subContainer.parentElement; // #family-tree
        const rect = targetNode.getBoundingClientRect();
        const containerRect = subContainer.getBoundingClientRect();
        const scale = panzoomInstance.getScale();

        const nodeCenterX = (rect.left - containerRect.left + rect.width / 2) / scale;
        const nodeCenterY = (rect.top - containerRect.top + rect.height / 2) / scale;

        const offsetX = (parent.clientWidth / 2) - nodeCenterX * scale;
        const offsetY = (parent.clientHeight / 2) - nodeCenterY * scale;

        // Zoom leggermente se siamo molto distanti
        const targetScale = Math.max(scale, 0.8);
        panzoomInstance.zoom(targetScale, { animate: true });
        
        setTimeout(() => {
            panzoomInstance.pan(offsetX, offsetY, { animate: true });
            
            if (shouldHighlight) {
                // Highlight effect
                targetNode.style.transition = 'all 0.5s';
                targetNode.style.boxShadow = '0 0 20px #0d6efd';
                targetNode.style.borderColor = '#0d6efd';
                setTimeout(() => {
                    targetNode.style.boxShadow = '';
                    targetNode.style.borderColor = '';
                }, 2000);
            }
        }, 300);
    }
}

function initPanzoom(element) {
    if (panzoomInstance) {
        panzoomInstance.destroy();
    }

    if (typeof Panzoom === 'undefined') {
        console.error("Panzoom non trovato!");
        return;
    }

    panzoomInstance = Panzoom(element, {
        maxScale: 5,
        minScale: 0.05,
        canvas: true,
        cursor: 'grab',
        touchAction: 'none'
    });

    document.getElementById('zoom-in').addEventListener('click', () => panzoomInstance.zoomIn({ animate: true }));
    document.getElementById('zoom-out').addEventListener('click', () => panzoomInstance.zoomOut({ animate: true }));
    document.getElementById('zoom-reset').addEventListener('click', () => fitToScreen(element));
    
    const exportBtn = document.getElementById('export-image');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => exportTreeAsImage(element));
    }

    // Support pinch zoom and double tap on mobile
    element.addEventListener('wheel', (event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        panzoomInstance.zoomWithWheel(event);
    }, { passive: false });
}

async function exportTreeAsImage(element) {
    if (!panzoomInstance) return;

    const exportBtn = document.getElementById('export-image');
    const originalText = exportBtn.innerText;
    exportBtn.innerText = '⌛';
    exportBtn.disabled = true;

    try {
        // Reset zoom and pan for export to get full view
        const currentScale = panzoomInstance.getScale();
        const currentPan = panzoomInstance.getPan();
        
        // Temporarily reset panzoom to scale 1 to capture at full resolution
        panzoomInstance.reset({ animate: false });
        
        // Give time for layout to settle
        await new Promise(r => setTimeout(r, 500));

        const canvas = await html2canvas(element, {
            useCORS: true,
            scale: 2, // High resolution
            backgroundColor: '#ffffff',
            logging: false,
            onclone: (clonedDoc) => {
                // Ensure the cloned element is visible and properly sized
                const clonedElement = clonedDoc.getElementById(element.id);
                clonedElement.style.transform = 'none';
                clonedElement.style.width = 'auto';
                clonedElement.style.height = 'auto';
                clonedElement.style.overflow = 'visible';
            }
        });

        // Restore original panzoom state
        panzoomInstance.zoom(currentScale, { animate: false });
        panzoomInstance.pan(currentPan.x, currentPan.y, { animate: false });

        // Download the image
        const link = document.createElement('a');
        link.download = `albero_famiglia_${new Date().getTime()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (error) {
        console.error("Errore durante l'esportazione:", error);
        alert("Si è verificato un errore durante l'esportazione dell'immagine.");
    } finally {
        exportBtn.innerText = originalText;
        exportBtn.disabled = false;
    }
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
    // Imposta un limite minimo per la scala automatica (es. 0.5) per mantenere la leggibilità.
    scale = Math.min(Math.max(scale, 0.5), 1.2); 

    panzoomInstance.zoom(scale, { animate: true });
    
    const offsetX = (parentWidth / 2) - (minX + contentWidth / 2) * scale;
    const offsetY = (parentHeight / 2) - (minY + contentHeight / 2) * scale;
    
    panzoomInstance.pan(offsetX, offsetY, { animate: true });
}

let resizeTimer;
let lastWidth = window.innerWidth;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
        const currentWidth = window.innerWidth;
        // Solo se la larghezza cambia significativamente (evita trigger da scroll mobile che nasconde/mostra barra indirizzi)
        if (Math.abs(currentWidth - lastWidth) > 50) {
            lastWidth = currentWidth;
            const treeContainer = document.getElementById('family-tree');
            if (treeContainer) {
                treeContainer.innerHTML = '';
                initTree();
            }
        } else {
            // Altrimenti adatta solo la vista esistente
            const treeContainer = document.getElementById('family-tree');
            if (treeContainer) {
                const subContainer = treeContainer.querySelector('.treant-instance');
                if (subContainer) {
                    fitToScreen(subContainer);
                }
            }
        }
    }, 250);
});
