/* ==========================================================================
   1. FUNÇÕES DE NAVEGAÇÃO DO ADMINISTRADOR (index_admin.html)
   ========================================================================== */
function navegar(idTela) {
    document.querySelectorAll('.aba-conteudo').forEach(tela => {
        tela.style.display = 'none';
    });

    const telaAlvo = document.getElementById('tela-' + idTela);
    if (telaAlvo) {
        telaAlvo.style.display = 'block';
    }

    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const itemMenu = document.querySelector(`[data-tela="${idTela}"]`);
    if (itemMenu) {
        itemMenu.classList.add('active');
    }

    const titulos = {
        'dashboard': 'Dashboard',
        'acervo': 'Acervo',
        'novo-livro': 'Acervo > Novo Livro',
        'emprestimos': 'Empréstimos',
        'devolucoes': 'Devoluções',
        'reservas': 'Reservas',
        'usuarios': 'Usuários',
        'relatorios': 'Relatórios',
        'configuracoes': 'Configurações'
    };
    if (titulos[idTela]) {
        document.getElementById('titulo-pagina').innerText = titulos[idTela];
    }

    alternarFormEmprestimo(false);
    alternarFormUsuario(false);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function alternarFormEmprestimo(exibir) {
    const formulario = document.getElementById('form-registro-emprestimo');
    if (formulario) {
        formulario.style.display = exibir ? 'block' : 'none';
    }
}

function alternarFormUsuario(exibir) {
    const formulario = document.getElementById('form-registro-usuario');
    if (formulario) {
        formulario.style.display = exibir ? 'block' : 'none';
    }
}

function alternarAbaUsuarios(subtela, btnAtivo) {
    document.querySelectorAll('.subtela-usuarios').forEach(tela => {
        tela.style.display = 'none';
    });

    const telaAlvo = document.getElementById('subtela-' + subtela);
    if (telaAlvo) {
        telaAlvo.style.display = 'block';
    }

    document.querySelectorAll('.btn-subnav').forEach(btn => {
        btn.classList.remove('active');
    });

    if (btnAtivo) {
        btnAtivo.classList.add('active');
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/* ==========================================================================
   1.1 FUNÇÕES DA TELA DE LOGIN / SOLICITAR CADASTRO (login.html)
   ========================================================================== */
function mostrarTelaLogin(destino) {
    const mapa = {
        login: { el: document.getElementById('tela-login'), display: 'block' },
        cadastro: { el: document.getElementById('tela-cadastro'), display: 'block' },
        esqueci: { el: document.getElementById('tela-esqueci-senha'), display: 'flex' }
    };

    Object.values(mapa).forEach(item => {
        if (item.el) item.el.style.display = 'none';
    });

    const alvo = mapa[destino] || mapa.login;
    if (alvo.el) {
        alvo.el.style.display = alvo.display;
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/* ==========================================================================
   1.2 MENU DE PERFIL DO USUÁRIO (dropdown + modal "Meu Perfil")
   ========================================================================== */
function toggleMenuPerfil(event) {
    if (event) event.stopPropagation();

    const dropdown = document.getElementById('dropdown-perfil');
    if (!dropdown) return;

    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}

document.addEventListener('click', function(event) {
    const menu = document.querySelector('.user-menu');
    const dropdown = document.getElementById('dropdown-perfil');

    if (menu && dropdown && dropdown.style.display === 'block' && !menu.contains(event.target)) {
        dropdown.style.display = 'none';
    }
});

function abrirModalPerfil(aba) {
    const dropdown = document.getElementById('dropdown-perfil');
    if (dropdown) {
        dropdown.style.display = 'none';
    }

    const overlay = document.getElementById('modal-overlay-perfil');
    if (overlay) {
        overlay.style.display = 'flex';
    }

    const btnAlvo = document.getElementById(aba === 'senha' ? 'tab-perfil-senha' : 'tab-perfil-informacoes');
    alternarAbaPerfil(aba, btnAlvo);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function fecharModalPerfil() {
    const overlay = document.getElementById('modal-overlay-perfil');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function alternarAbaPerfil(aba, btnAtivo) {
    document.querySelectorAll('.subaba-perfil').forEach(el => {
        el.style.display = 'none';
    });

    const alvo = document.getElementById('subaba-perfil-' + aba);
    if (alvo) {
        alvo.style.display = 'block';
    }

    document.querySelectorAll('.btn-tab-perfil').forEach(btn => {
        btn.classList.remove('active');
    });

    if (btnAtivo) {
        btnAtivo.classList.add('active');
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/* ==========================================================================
   2. FUNÇÕES DE NAVEGAÇÃO DO LEITOR (index_leitor.html)
   ========================================================================== */
function navegarLeitor(destino) {
    const abaPainel = document.getElementById('aba-painel');
    const abaBuscar = document.getElementById('aba-buscar');
    const btnPainel = document.getElementById('btn-nav-painel');
    const btnBuscar = document.getElementById('btn-nav-buscar');
    const titulo = document.getElementById('titulo-pagina');

    if (!abaPainel || !abaBuscar || !btnPainel || !btnBuscar) return;

    abaPainel.style.display = 'none';
    abaBuscar.style.display = 'none';

    if (destino === 'painel') {
        abaPainel.style.display = 'block';
        btnPainel.classList.add('active');
        btnBuscar.classList.remove('active');
        if (titulo) titulo.innerText = 'Meu Painel';
    } else if (destino === 'buscar') {
        abaBuscar.style.display = 'block';
        btnBuscar.classList.add('active');
        btnPainel.classList.remove('active');
        if (titulo) titulo.innerText = 'Buscar Livros';
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/* ==========================================================================
   3. CONTROLE DE RECOLHER O MENU (SIDEBAR COLLAPSE)
   ========================================================================== */
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const btnRecolher = document.getElementById('btn-recolher');
    
    if (sidebar && btnRecolher) {
        sidebar.classList.toggle('collapsed');
        
        if (sidebar.classList.contains('collapsed')) {
            btnRecolher.innerHTML = '<i data-lucide="menu"></i>';
        } else {
            btnRecolher.innerHTML = '<i data-lucide="menu"></i> <text>Recolher menu</text>';
        }
        
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

/* ==========================================================================
   4. LOGICA DO MODO NOTURNO (DARK MODE)
   ========================================================================== */
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const targetTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', targetTheme);
    localStorage.setItem('theme', targetTheme); 
    
    atualizarIconeTema(targetTheme);
}

function atualizarIconeTema(tema) {
    const icon = document.getElementById('theme-icon');
    if (!icon) return; 
    
    if (tema === 'dark') {
        icon.setAttribute('data-lucide', 'moon');
    } else {
        icon.setAttribute('data-lucide', 'sun');
    }
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/* ==========================================================================
   5. INICIALIZAÇÃO ÚNICA AO CARREGAR A PÁGINA
   ========================================================================== */
document.addEventListener("DOMContentLoaded", function() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    atualizarIconeTema(savedTheme);
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});

function efetuarLogout() {
    localStorage.removeItem("usuario-logado-nome");
    localStorage.removeItem("usuario-logado-email");
    window.location.href = "login.html";
}

// Tornar funções acessíveis globalmente pelas tags onclick do HTML
window.efetuarLogout = efetuarLogout;
window.navegar = navegar;
window.alternarFormEmprestimo = alternarFormEmprestimo;
window.alternarFormUsuario = alternarFormUsuario;
window.alternarAbaUsuarios = alternarAbaUsuarios;
window.mostrarTelaLogin = mostrarTelaLogin;
window.toggleMenuPerfil = toggleMenuPerfil;
window.abrirModalPerfil = abrirModalPerfil;
window.fecharModalPerfil = fecharModalPerfil;
window.alternarAbaPerfil = alternarAbaPerfil;
window.navegarLeitor = navegarLeitor;
window.toggleSidebar = toggleSidebar;
window.toggleTheme = toggleTheme;