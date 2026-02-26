// Initialize Supabase
initSupabase();

let panzoomInstance;

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
        
        return buildTreeHierarchy(data);
    } catch (error) {
        console.error("Could not fetch family data from Supabase:", error);
    }
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
        }
    });

    return roots;
}

// Function to transform my internal data to Treant format
function transformData(node) {
    if (!node) return null;

    let treantNode = {
        text: {
            name: node.name,
            contact: node.contact
        },
        children: node.children ? node.children.map(transformData) : []
    };

    if (node.spouse) {
        treantNode.HTMLclass = "node couple-node";
        treantNode.innerHTML = `
            <div class="person-container">
                <div class="person bloodline-person">
                    <p class="node-name">${node.name}</p>
                    <p class="node-contact">${node.contact || ''}</p>
                </div>
                <div class="spouse-separator"></div>
                <div class="person spouse-person">
                    <p class="node-name">${node.spouse.name}</p>
                    ${node.spouse.title ? `<p class="node-title">${node.spouse.title}</p>` : ''}
                    <p class="node-contact">${node.spouse.contact || ''}</p>
                </div>
            </div>
        `;
    } else {
        treantNode.HTMLclass = "node single-node";
        treantNode.innerHTML = `
            <div class="person single-person bloodline-person">
                <p class="node-name">${node.name}</p>
                <p class="node-contact">${node.contact || ''}</p>
            </div>
        `;
    }

    return treantNode;
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

    const subContainerId = `tree-instance-main`;
    const subContainer = document.createElement('div');
    subContainer.id = subContainerId;
    subContainer.className = 'treant-instance';
    container.appendChild(subContainer);

    const virtualRoot = {
        HTMLclass: 'virtual-root',
        children: roots.map(transformData),
        text: { name: 'Virtual Root' }
    };

    const chart_config = {
        chart: {
            container: `#${subContainerId}`,
            levelSeparation: 60,
            siblingSeparation: 40,
            subTeeSeparation: 40,
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
            connectors: {
                type: "step",
                style: {
                    "stroke-width": 2,
                    "stroke": "#ccc"
                }
            }
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

    if (typeof Panzoom === 'undefined') {
        console.error("Panzoom non trovato!");
        return;
    }

    panzoomInstance = Panzoom(element, {
        maxScale: 5,
        minScale: 0.1,
        canvas: true,
        cursor: 'grab'
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

let resizeTimer;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
        const treeContainer = document.getElementById('family-tree');
        if (treeContainer) {
            treeContainer.innerHTML = '';
            initTree();
        }
    }, 250);
});

document.addEventListener('DOMContentLoaded', initTree);
