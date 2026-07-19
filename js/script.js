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

/* ==========================================================================
   2. FUNÇÕES DE NAVEGAÇÃO DO LEITOR (index_leitor.html)
   ========================================================================== */
function navegarLeitor(destino) {
    const abaPainel = document.getElementById('aba-painel');
    const abaBuscar = document.getElementById('aba-buscar');
    const btnPainel = document.getElementById('btn-nav-painel');
    const btnBuscar = document.getElementById('btn-nav-buscar');
    const titulo = document.getElementById('titulo-pagina');

    // Valida se os elementos existem na página antes de executar
    if (!abaPainel || !abaBuscar || !btnPainel || !btnBuscar) return;

    // Oculta as abas
    abaPainel.style.display = 'none';
    abaBuscar.style.display = 'none';

    // Controla a visibilidade, títulos e as classes ativas do menu
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

    // Renderiza novamente os ícones do Lucide na nova aba do leitor
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

function actualizarIconeTema(tema) {
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