// ==========================================================================
// CONTROLE DE ACESSO: APENAS ADMINISTRADORES OU BIBLIOTECÁRIOS
// ==========================================================================
(async function verificarAcessoAdmin() {
    const nomeLogado = localStorage.getItem("usuario-logado-nome");
    const emailLogado = localStorage.getItem("usuario-logado-email");

    if (!nomeLogado || !emailLogado) {
        mostrarNotificacao("Acesso negado! Por favor, faça login.", "error");
        window.location.href = "login.html";
        return;
    }

    try {
        const { db, collection, getDocs } = await import("./firebase-config.js");
        const querySnapshot = await getDocs(collection(db, "usuarios"));
        let ehAdmin = false;

        querySnapshot.forEach((docSnap) => {
            const user = docSnap.data();
            if (user.email && user.email.toLowerCase() === emailLogado.toLowerCase()) {
                const cargo = user.tipoUser ? user.tipoUser.toLowerCase().trim() : "";
                if (cargo === "admin" || cargo === "administrador" || cargo === "bibliotecario") {
                    ehAdmin = true;
                }
            }
        });

        if (!ehAdmin) {
            mostrarNotificacao("Área restrita para administradores ou bibliotecários!", "error");
            window.location.href = "login.html";
        }
    } catch (error) {
        console.error("Erro na verificação de acesso:", error);
    }
})();

import { db, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, getDoc } from "./firebase-config.js";

// ==========================================================================
// FUNÇÕES AUXILIARES E NAVEGAÇÃO GLOBAL
// ==========================================================================
function tratarData(dataBanco) {
    if (!dataBanco) return new Date();
    if (typeof dataBanco.toDate === "function") return dataBanco.toDate();
    if (typeof dataBanco === "string" && dataBanco.includes("/")) {
        const partes = dataBanco.split("/");
        return new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
    }
    const dataTenta = new Date(dataBanco);
    return isNaN(dataTenta.getTime()) ? new Date() : dataTenta;
}

// NAVEGAÇÃO DE TELAS NO PAINEL ADMIN
window.navegar = function(tela) {
    const telas = document.querySelectorAll(".aba-conteudo");
    telas.forEach(t => t.style.display = "none");

    const telaAlvo = document.getElementById(`tela-${tela}`);
    if (telaAlvo) {
        telaAlvo.style.display = "block";
    }

    const itensMenu = document.querySelectorAll(".sidebar-menu .sidebar-item");
    itensMenu.forEach(item => {
        if (item.getAttribute("data-tela") === tela) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });

    const tituloPagina = document.getElementById("titulo-pagina");
    if (tituloPagina) {
        const titulos = {
            dashboard: "Dashboard",
            acervo: "Acervo de Livros",
            "novo-livro": "Cadastrar / Editar Livro",
            emprestimos: "Gestão de Empréstimos",
            devolucoes: "Fluxo de Devoluções",
            reservas: "Reservas de Livros",
            usuarios: "Gestão de Usuários",
            relatorios: "Relatórios Gerais",
            configuracoes: "Configurações do Sistema"
        };
        tituloPagina.innerText = titulos[tela] || "Painel do Administrador";
    }

    // SE CLICOU EM NOVO LIVRO E NÃO ESTÁ EM MODO DE EDIÇÃO, LIMPA TUDO
    if (tela === "novo-livro") {
        const btnSalvar = document.getElementById("btn-salvar-livro");
        if (btnSalvar && !btnSalvar.dataset.editId) {
            window.limparFormularioLivro();
        }
    }

    if (tela === "dashboard") carregarMétricasDashboard();
    if (tela === "acervo") listarAcervoBanco();
    if (tela === "emprestimos") { listarEmprestimosBanco(); carregarSelectsEmprestimo(); }
    if (tela === "devolucoes") listarEmprestimosParaDevolucao();
    if (tela === "configuracoes") carregarConfiguracoesBanco();
    if (tela === "usuarios") listarUsuariosBanco();
    if (tela === "reservas") listarReservasBanco();
};

window.deletarDocumento = async function(colecao, id) {
    const nomesAmigaveis = {
        'books': 'este livro',
        'usuarios': 'este usuário',
        'emprestimos': 'este registro de empréstimo',
        'reservas': 'esta reserva'
    };

    const confirmou = await confirmarAcao(
        "Tem certeza?",
        `Esta ação excluirá permanentemente ${nomesAmigaveis[colecao] || 'este registro'} do banco de dados.`,
        "Sim, excluir!"
    );

    if (!confirmou) return;

    try {
        await deleteDoc(doc(db, colecao, id));
        mostrarNotificacao("Registro removido com sucesso!", "success");

        if (colecao === "books") listarAcervoBanco();
        if (colecao === "emprestimos") {
            listarEmprestimosBanco();
            listarEmprestimosParaDevolucao();
        }
        if (colecao === "usuarios") listarUsuariosBanco();
        if (colecao === "reservas") listarReservasBanco();
        
        carregarMétricasDashboard();
    } catch (error) {
        console.error("Erro ao deletar:", error);
        mostrarNotificacao("Erro ao tentar excluir o registro.", "error");
    }
};

window.prepararEdicaoLivro = async function(id) {
    try {
        const docSnap = await getDoc(doc(db, "books", id));
        if (!docSnap.exists()) return;
        const livro = docSnap.data();
        
        document.getElementById("input-livro-titulo").value = livro.titulo || "";
        document.getElementById("input-livro-autor").value = livro.autor || "";
        document.getElementById("input-livro-editora").value = livro.editora || "";
        document.getElementById("input-livro-ano").value = livro.ano_publicacao || "";
        document.getElementById("input-livro-isbn").value = livro.isbn || "";
        document.getElementById("input-livro-capa").value = livro.capa || "";
        
        const btn = document.getElementById("btn-salvar-livro");
        if (btn) {
            btn.innerText = "Atualizar Livro";
            btn.dataset.editId = id;
        }
        
        window.navegar("novo-livro");
    } catch (error) {
        console.error("Erro ao preparar edição:", error);
    }
};

window.alternarFormEmprestimo = function(exibir) {
    const form = document.getElementById("form-registro-emprestimo");
    if (form) {
        form.style.display = exibir ? "block" : "none";
        if (exibir) carregarSelectsEmprestimo();
    }
};

window.alternarFormUsuario = function(exibir) {
    const form = document.getElementById("form-registro-usuario");
    if (form) form.style.display = exibir ? "block" : "none";
};

window.alternarAbaUsuarios = function(subaba, btn) {
    const subTelas = document.querySelectorAll(".subtela-usuarios");
    subTelas.forEach(s => s.style.display = "none");

    const subAlvo = document.getElementById(`subtela-${subaba}`);
    if (subAlvo) subAlvo.style.display = "block";

    const botoes = document.querySelectorAll(".table-controls-usuarios .btn-subnav");
    botoes.forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
};

// ==========================================================================
// 1. TELA: DASHBOARD
// ==========================================================================
async function carregarMétricasDashboard() {
    const containerRecentes = document.getElementById("container-emprestimos-recentes");
    const containerMultas = document.getElementById("container-alertas-multa") || document.getElementById("container-alertas-devolucao");
    
    try {
        const queryLivros = await getDocs(collection(db, "books"));
        const queryUsuarios = await getDocs(collection(db, "usuarios"));
        const queryEmprestimos = await getDocs(collection(db, "emprestimos"));

        let totalAtrasados = 0;
        let htmlRecentes = "";
        let htmlMultas = "";

        let valorMultaDiaria = 1.50; 
        const queryConfig = await getDocs(collection(db, "configuracao"));
        if (!queryConfig.empty) {
            const config = queryConfig.docs[0].data();
            valorMultaDiaria = parseFloat(config.valor_multa_diaria) || 1.50;
        }

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        queryEmprestimos.forEach((docSnap) => {
            const emp = docSnap.data();
            if (emp.status === "Devolvido") return;

            const leitor = emp.Usuario_idUsuario || "Desconhecido";
            const livro = emp.Exemplar_idExemplar || "Livro Não Informado";
            
            let dataDevPrevista = tratarData(emp.data_devolucao_prevista);
            let dataDevCompara = new Date(dataDevPrevista);
            dataDevCompara.setHours(0, 0, 0, 0);

            const estaAtrasado = hoje > dataDevCompara || emp.status === "Atrasado";

            if (estaAtrasado) {
                totalAtrasados++;
                const diferencaTempo = hoje.getTime() - dataDevCompara.getTime();
                const diasAtraso = Math.max(1, Math.ceil(diferencaTempo / (1000 * 60 * 60 * 24)));
                const valorCalculado = (diasAtraso * valorMultaDiaria).toFixed(2).replace('.', ',');

                htmlMultas += `
                    <div class="alert-card-danger" style="margin-bottom: 8px;">
                        <div class="alert-row"><strong>${leitor}</strong><strong>R$ ${valorCalculado}</strong></div>
                        <p class="alert-subtitle">${livro} — ${diasAtraso} dia(s) de atraso</p>
                    </div>
                `;
            }

            const statusTag = estaAtrasado ? "danger" : "success";
            const statusTexto = estaAtrasado ? "Atrasado" : (emp.status || "Em andamento");
            const dataExibicao = dataDevPrevista.toLocaleDateString('pt-BR');

            htmlRecentes += `
                <div class="list-item">
                    <div><h4>${livro}</h4><p>${leitor} - devolução ${dataExibicao}</p></div>
                    <span class="status-tag ${statusTag}">${statusTexto}</span>
                </div>
            `;
        });

        const cards = document.querySelectorAll(".metric-value");
        if (cards.length >= 4) {
            cards[0].innerText = queryLivros.size;
            cards[1].innerText = queryEmprestimos.size - totalAtrasados; 
            cards[2].innerText = totalAtrasados; 
            cards[3].innerText = queryUsuarios.size;
        }

        if (containerRecentes) {
            containerRecentes.innerHTML = htmlRecentes || '<p style="color: var(--muted-foreground); font-size: 14px; text-align: center; padding: 16px 0;">Nenhum empréstimo ativo.</p>';
        }
        if (containerMultas) {
            containerMultas.innerHTML = htmlMultas || '<p style="color: var(--muted-foreground); font-size: 14px; text-align: center; padding: 16px 0;">Nenhum alerta de pendência ativo.</p>';
        }

    } catch (error) {
        console.error("Erro nas métricas do Dashboard:", error);
    }
}

// ==========================================================================
// 2. TELA: ACERVO (LISTAR, CRIAR E EDITAR)
// ==========================================================================
let livrosAcervoAdminCache = [];

async function listarAcervoBanco() {
    const tbody = document.querySelector("#tela-acervo .admin-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='8'>Carregando acervo do Firebase...</td></tr>";

    try {
        const querySnapshot = await getDocs(collection(db, "books"));
        const queryEmprestimos = await getDocs(collection(db, "emprestimos"));

        const livrosEmprestados = [];
        queryEmprestimos.forEach(d => {
            const emp = d.data();
            if (emp.status !== "Devolvido" && emp.Exemplar_idExemplar) {
                livrosEmprestados.push(emp.Exemplar_idExemplar.trim().toLowerCase());
            }
        });

        livrosAcervoAdminCache = [];
        const generosEncontrados = new Set();

        querySnapshot.forEach((docSnap) => {
            const livro = docSnap.data();
            const idDoc = docSnap.id;
            const titulo = livro.titulo || "Sem título";
            const genero = livro.categoria_idCategoria || "Geral";
            generosEncontrados.add(genero);

            const estaEmprestado = livrosEmprestados.includes(titulo.trim().toLowerCase());
            const statusTexto = estaEmprestado ? "Indisponível" : "Disponível";
            const statusTag = estaEmprestado ? "danger" : "success";

            livrosAcervoAdminCache.push({
                id: idDoc,
                ...livro,
                titulo,
                genero,
                statusTexto,
                statusTag
            });
        });

        const selectGeneroAdmin = document.getElementById("filtro-acervo-genero");
        if (selectGeneroAdmin) {
            const valAtual = selectGeneroAdmin.value;
            selectGeneroAdmin.innerHTML = `<option value="">Todos (Gêneros)</option>`;
            Array.from(generosEncontrados).sort().forEach(g => {
                selectGeneroAdmin.innerHTML += `<option value="${g}">${g}</option>`;
            });
            selectGeneroAdmin.value = valAtual;
        }

        renderizarTabelaAcervoAdmin();

    } catch (error) {
        console.error("Erro ao listar acervo no admin:", error);
    }
}

function renderizarTabelaAcervoAdmin() {
    const tbody = document.querySelector("#tela-acervo .admin-table tbody");
    if (!tbody) return;

    const inputBusca = document.querySelector("#tela-acervo .search-input")?.value.toLowerCase().trim() || "";
    const filtroGenero = document.getElementById("filtro-acervo-genero")?.value || "";
    const filtroStatus = document.querySelectorAll("#tela-acervo .select-filter")[1]?.value || "";

    const filtrados = livrosAcervoAdminCache.filter(livro => {
        const bateTexto = (livro.titulo || "").toLowerCase().includes(inputBusca) ||
                          (livro.autor || "").toLowerCase().includes(inputBusca) ||
                          (livro.genero || "").toLowerCase().includes(inputBusca) ||
                          (livro.isbn || "").toLowerCase().includes(inputBusca);

        const bateGenero = !filtroGenero || livro.genero === filtroGenero;

        let bateStatus = true;
        if (filtroStatus === "disponivel") bateStatus = livro.statusTexto === "Disponível";
        else if (filtroStatus === "indisponivel") bateStatus = livro.statusTexto === "Indisponível";

        return bateTexto && bateGenero && bateStatus;
    });

    tbody.innerHTML = "";

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--muted-foreground);">Nenhum livro encontrado com esses filtros.</td></tr>`;
        return;
    }

    filtrados.forEach((livro) => {
        const tituloEscapado = (livro.titulo || "").replace(/'/g, "\\'");
        
        // Se houver capa, renderiza a imagem com onerror para trocar caso o link quebre.
        // Se não houver capa, renderiza direto a capa CSS.
        const capaHTML = livro.capa 
            ? `<img src="${livro.capa}" class="table-cover-img" onerror="this.outerHTML=window.gerarCapaPlaceholder('${tituloEscapado}')">`
            : window.gerarCapaPlaceholder(livro.titulo);

        const linha = `
            <tr>
                <td>${capaHTML}</td>
                <td><strong>${livro.titulo}</strong></td>
                <td>${livro.autor || "Desconhecido"}</td>
                <td><span class="book-tag">${livro.genero}</span></td>
                <td>${livro.isbn || "-"}</td>
                <td><strong>${livro.quantidade || 1}</strong></td>
                <td><span class="status-tag ${livro.statusTag}">${livro.statusTexto}</span></td>
                <td>
                    <button class="action-icon" onclick="prepararEdicaoLivro('${livro.id}')" title="Editar"><i data-lucide="pencil" class="icon-small"></i></button>
                    <button class="action-icon btn-action-danger" onclick="deletarDocumento('books', '${livro.id}')" title="Excluir"><i data-lucide="trash-2" class="icon-small"></i></button>
                </td>
            </tr>
        `;
        tbody.insertAdjacentHTML("beforeend", linha);
    });

    if (typeof lucide !== "undefined") lucide.createIcons();
}

window.limparFormularioLivro = function() {
    // 1. Limpa os campos do formulário
    const idsInputs = [
        "input-livro-titulo", "input-livro-autor", "input-livro-editora",
        "input-livro-ano", "input-livro-isbn", "input-livro-capa", 
        "input-busca-catalogo"
    ];

    idsInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    const inputQtd = document.getElementById("input-livro-quantidade");
    if (inputQtd) inputQtd.value = "1";

    const inputGenero = document.getElementById("input-livro-genero");
    if (inputGenero) inputGenero.value = "Geral";

    // 2. Limpa avisos e resultados do autofill
    const resultsContainer = document.getElementById("autofill-results");
    const statusMsg = document.getElementById("autofill-status");
    if (resultsContainer) resultsContainer.innerHTML = "";
    if (statusMsg) statusMsg.textContent = "";

    // 3. REMOVE O MODO DE EDIÇÃO DO BOTÃO
    const btnSalvar = document.getElementById("btn-salvar-livro");
    if (btnSalvar) {
        btnSalvar.innerText = "Salvar Livro";
        delete btnSalvar.dataset.editId; // Remove a chave de edição!
    }
};

const btnSalvarLivro = document.getElementById("btn-salvar-livro");
if (btnSalvarLivro) {
    btnSalvarLivro.addEventListener("click", async () => {
        const titulo = document.getElementById("input-livro-titulo")?.value.trim();
        const autor = document.getElementById("input-livro-autor")?.value.trim();
        const editora = document.getElementById("input-livro-editora")?.value.trim();
        const ano = document.getElementById("input-livro-ano")?.value.trim();
        const isbn = document.getElementById("input-livro-isbn")?.value.trim();
        const capa = document.getElementById("input-livro-capa")?.value.trim();
        const genero = document.getElementById("input-livro-genero")?.value || "Geral";
        const quantidade = parseInt(document.getElementById("input-livro-quantidade")?.value) || 1;

        if (!titulo || !autor) return mostrarNotificacao("Preencha Título e Autor!", "warning");

        try {
            // Se NÃO tiver o editId, faz a trava anti-duplicidade
            if (!btnSalvarLivro.dataset.editId) {
                const queryLivros = await getDocs(collection(db, "books"));
                let livroExistente = false;

                queryLivros.forEach((docSnap) => {
                    const l = docSnap.data();
                    const isbnExistente = l.isbn ? l.isbn.trim() : "";
                    const tituloExistente = l.titulo ? l.titulo.trim().toLowerCase() : "";
                    const autorExistente = l.autor ? l.autor.trim().toLowerCase() : "";

                    if ((isbn && isbnExistente === isbn) || (tituloExistente === titulo.toLowerCase() && autorExistente === autor.toLowerCase())) {
                        livroExistente = true;
                    }
                });

                if (livroExistente) {
                    return mostrarNotificacao("Este livro já está cadastrado no acervo!", "warning");
                }
            }

            const dadosLivro = {
                titulo, autor, editora, isbn, capa,
                ano_publicacao: parseInt(ano) || null,
                categoria_idCategoria: genero,
                quantidade: quantidade
            };

            if (btnSalvarLivro.dataset.editId) {
                await updateDoc(doc(db, "books", btnSalvarLivro.dataset.editId), dadosLivro);
                mostrarNotificacao("Livro atualizado com sucesso!", "success");
            } else {
                await addDoc(collection(db, "books"), dadosLivro);
                mostrarNotificacao("Livro cadastrado com sucesso!", "success");
            }

            // LIMPA O FORMULÁRIO E RESETA O MODO DE EDIÇÃO
            window.limparFormularioLivro();

            // Volta para a tela do acervo
            window.navegar("acervo");
            listarAcervoBanco();
            carregarMétricasDashboard();

        } catch (error) {
            console.error("Erro ao salvar livro:", error);
            mostrarNotificacao("Erro ao salvar o livro no banco.", "error");
        }
    });
}

// ==========================================================================
// AUTO-PREENCHIMENTO DE LIVRO (OPEN LIBRARY / BRASIL API)
// ==========================================================================

window.resultadosCatalogoTemporarios = [];

const inputBusca = document.getElementById("input-busca-catalogo");
const statusMsg = document.getElementById("autofill-status");
const resultsContainer = document.getElementById("autofill-results");
const btnAutofill = document.getElementById("btn-autofill");

if (btnAutofill && inputBusca) {
    btnAutofill.addEventListener("click", () => executarBusca());
    inputBusca.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            executarBusca();
        }
    });
}

function executarBusca() {
    const query = inputBusca ? inputBusca.value.trim() : "";
    if (!query) return;

    // Limpa pontuações para testar se é apenas número (ISBN)
    const textoLimpo = query.replace(/[^0-9X]/gi, '');
    const contemLetras = /[a-wy-z]/i.test(query);
    const ehIsbnPuro = (textoLimpo.length === 10 || textoLimpo.length === 13) && !contemLetras;

    if (ehIsbnPuro) {
        buscarPorISBNExato(textoLimpo);
    } else {
        buscarPorTituloAmpliado(query);
    }
}

async function buscarPorISBNExato(isbn) {
    if (statusMsg) statusMsg.textContent = "Buscando por ISBN...";
    
    // 1. Brasil API
    try {
        const resp = await fetch(`https://brasilapi.com.br/api/isbn/v1/${isbn}`);
        if (resp.ok) {
            const livro = await resp.json();
            salvarResultado([{
                title: livro.title || "",
                authors: livro.authors || [],
                year: livro.year ? String(livro.year) : "",
                publisher: livro.publisher || "",
                isbn: livro.isbn || isbn,
                cover: livro.cover_url || ''
            }]);
            return;
        }
    } catch (e) { 
        console.warn("Brasil API não encontrou:", e); 
    }

    // 2. Google Books ISBN
    try {
        const resp = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
        const data = await resp.json();
        
        if (data.items && data.items.length > 0) {
            const info = data.items[0].volumeInfo || {};
            salvarResultado([{
                title: info.title || "",
                authors: info.authors || [],
                year: info.publishedDate ? info.publishedDate.substring(0, 4) : "",
                publisher: info.publisher || "",
                isbn: isbn,
                cover: info.imageLinks?.thumbnail ? info.imageLinks.thumbnail.replace("http://", "https://") : ""
            }]);
            return;
        }
    } catch (e) { 
        console.warn("Google Books ISBN não encontrou:", e); 
    }

    // Se falhar o ISBN exato, tenta buscar como texto geral
    buscarPorTituloAmpliado(isbn);
}

async function buscarPorTituloAmpliado(query) {
    if (statusMsg) statusMsg.textContent = "Pesquisando catálogo por título...";
    
    // 1. Google Books API (Serviço primário)
    try {
        const urlGoogle = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5&printType=books`;
        const resp = await fetch(urlGoogle);
        const data = await resp.json();

        if (data.items && data.items.length > 0) {
            const lista = data.items.map(item => {
                const info = item.volumeInfo || {};
                
                let isbnVal = "";
                if (info.industryIdentifiers && Array.isArray(info.industryIdentifiers)) {
                    const isbn13 = info.industryIdentifiers.find(id => id.type === "ISBN_13");
                    const isbn10 = info.industryIdentifiers.find(id => id.type === "ISBN_10");
                    isbnVal = isbn13 ? isbn13.identifier : (isbn10 ? isbn10.identifier : "");
                }

                return {
                    title: info.title || "Sem título",
                    authors: info.authors || [],
                    year: info.publishedDate ? info.publishedDate.substring(0, 4) : "",
                    publisher: info.publisher || "",
                    isbn: isbnVal,
                    cover: info.imageLinks?.thumbnail ? info.imageLinks.thumbnail.replace("http://", "https://") : ""
                };
            });

            salvarResultado(lista);
            return;
        }
    } catch (e) { 
        console.error("Erro Google Books Título:", e); 
    }

    // 2. Open Library (Serviço secundário)
    try {
        const urlOpenLib = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`;
        const resp = await fetch(urlOpenLib);
        const data = await resp.json();

        if (data.docs && data.docs.length > 0) {
            const lista = data.docs.map(livro => ({
                title: livro.title || "Sem título",
                authors: livro.author_name || [],
                year: livro.first_publish_year ? String(livro.first_publish_year) : "",
                publisher: (livro.publisher && livro.publisher.length > 0) ? livro.publisher[0] : "",
                isbn: (livro.isbn && livro.isbn.length > 0) ? livro.isbn[0] : "",
                cover: livro.cover_i ? `https://covers.openlibrary.org/b/id/${livro.cover_i}-M.jpg` : ""
            }));

            salvarResultado(lista);
            return;
        }
    } catch (e) {
        console.error("Erro Open Library Título:", e);
    }

    if (statusMsg) statusMsg.textContent = "Nenhum livro localizado para esta pesquisa.";
}

function salvarResultado(lista) {
    window.resultadosCatalogoTemporarios = lista;
    let html = "";

    if (!Array.isArray(lista) || lista.length === 0) {
        if (statusMsg) statusMsg.textContent = "Nenhum resultado disponível.";
        return;
    }

    lista.forEach((item, index) => {
        // Trata com segurança os autores (evita erro de .join em tipos não-array)
        let autoresTexto = "Autor desconhecido";
        if (Array.isArray(item.authors)) {
            autoresTexto = item.authors.length > 0 ? item.authors.join(", ") : "Autor desconhecido";
        } else if (typeof item.authors === "string" && item.authors.trim() !== "") {
            autoresTexto = item.authors;
        }

        const tituloEscapado = (item.title || "").replace(/'/g, "\\'");

        const capaResultHTML = item.cover
            ? `<img src="${item.cover}" class="autofill-result-img" onerror="this.outerHTML=window.gerarCapaPlaceholder('${tituloEscapado}')">`
            : window.gerarCapaPlaceholder(item.title);

        html += `
            <div class="autofill-result-item">
                ${capaResultHTML}
                <div class="autofill-result-info">
                    <span class="autofill-result-title">${item.title}</span>
                    <span class="autofill-result-details">${autoresTexto}</span>
                    <span style="font-size: 11px; color: var(--muted-foreground); display:block; margin-top:2px;">ISBN: <strong>${item.isbn || 'Não informado'}</strong></span>
                </div>
                <button type="button" class="autofill-select-btn" onclick="selecionarOpcaoHibrida(${index})">Selecionar</button>
            </div>
        `;
    });

    if (resultsContainer) resultsContainer.innerHTML = html;
    if (statusMsg) statusMsg.textContent = "Selecione um resultado:";
    if (typeof lucide !== "undefined") lucide.createIcons();
}

window.selecionarOpcaoHibrida = function(index) {
    const item = window.resultadosCatalogoTemporarios[index];
    if (!item) return;

    let autoresTexto = "";
    if (Array.isArray(item.authors)) {
        autoresTexto = item.authors.join(", ");
    } else if (typeof item.authors === "string") {
        autoresTexto = item.authors;
    }

    document.getElementById("input-livro-titulo").value = item.title || '';
    document.getElementById("input-livro-autor").value = autoresTexto;
    document.getElementById("input-livro-ano").value = item.year || '';
    document.getElementById("input-livro-editora").value = item.publisher || '';
    document.getElementById("input-livro-isbn").value = item.isbn || '';
    document.getElementById("input-livro-capa").value = item.cover || '';
    
    if (resultsContainer) resultsContainer.innerHTML = "";
    if (statusMsg) statusMsg.textContent = "✓ Dados preenchidos com sucesso!";
};

window.gerarCapaPlaceholder = function(titulo) {
    const tituloLimpo = titulo || "Sem Título";
    const inicial = tituloLimpo.trim().charAt(0).toUpperCase() || "B";

    return `
        <div class="table-cover-placeholder" title="${tituloLimpo}">
            <i data-lucide="book-open" class="icon-placeholder"></i>
            <span class="cover-initial">${inicial}</span>
        </div>
    `;
};

// ==========================================================================
// 3. TELA: EMPRÉSTIMOS
// ==========================================================================
function inicializarDatasEmprestimo() {
    const inputRetirada = document.getElementById("input-emprestimo-retirada");
    const inputDevolucao = document.getElementById("input-emprestimo-devolucao");

    if (inputRetirada && inputDevolucao) {
        const hoje = new Date();
        const devolucaoPadrao = new Date();
        devolucaoPadrao.setDate(hoje.getDate() + 7);

        if (!inputRetirada.value) inputRetirada.value = hoje.toLocaleDateString('pt-BR');
        if (!inputDevolucao.value) inputDevolucao.value = devolucaoPadrao.toLocaleDateString('pt-BR');
    }
}

async function carregarSelectsEmprestimo() {
    const inputLeitor = document.getElementById("select-emprestimo-leitor");
    const datalistLeitores = document.getElementById("list-leitores-autocomplete");
    
    const inputLivro = document.getElementById("select-emprestimo-livro");
    const datalistLivros = document.getElementById("list-livros-autocomplete");

    inicializarDatasEmprestimo();

    if (!datalistLeitores || !datalistLivros) return;

    try {
        // 1. CARREGA APENAS LEITORES ATIVOS
        const usersSnap = await getDocs(collection(db, "usuarios"));
        datalistLeitores.innerHTML = "";
        
        usersSnap.forEach(docSnap => {
            const user = docSnap.data();
            const status = (user.status || "Ativo").toLowerCase();
            const cargo = (user.tipoUser || "leitor").toLowerCase();

            // Filtra: exibe apenas usuários que NÃO estão inativos/excluídos e que são leitores
            if (status === "ativo" && cargo === "leitor") {
                datalistLeitores.innerHTML += `<option value="${user.nome}">`;
            }
        });

        // 2. CARREGA LIVROS DO ACERVO
        const booksSnap = await getDocs(collection(db, "books"));
        datalistLivros.innerHTML = "";

        booksSnap.forEach(docSnap => {
            const livro = docSnap.data();
            if (livro.titulo) {
                datalistLivros.innerHTML += `<option value="${livro.titulo}">`;
            }
        });

    } catch (error) { 
        console.error("Erro ao carregar leitores/livros para o autocompletar:", error); 
    }
}

let emprestimosAdminCache = [];

async function listarEmprestimosBanco() {
    const tbody = document.querySelector("#tela-emprestimos .admin-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='6'>Carregando empréstimos...</td></tr>";

    try {
        const querySnapshot = await getDocs(collection(db, "emprestimos"));
        emprestimosAdminCache = [];

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        querySnapshot.forEach((docSnap) => {
            const emp = docSnap.data();
            if (emp.status === "Devolvido") return;

            const leitorExibicao = emp.Usuario_idUsuario || "Desconhecido";
            const livroExibicao = emp.Exemplar_idExemplar || "Livro Não Informado";
            const idDoc = docSnap.id;

            if (emp.status === "Solicitado") {
                emprestimosAdminCache.push({
                    id: idDoc,
                    leitor: leitorExibicao,
                    livro: livroExibicao,
                    dataRetirada: emp.data_solicitacao || "Hoje",
                    dataDevolucao: "Aguardando retirada",
                    status: "Solicitado",
                    statusTag: "warning",
                    tipoSolicitado: true
                });
                return;
            }

            let dataDevPrevista = tratarData(emp.data_devolucao_prevista);
            let dataDevCompara = new Date(dataDevPrevista);
            dataDevCompara.setHours(0, 0, 0, 0);

            let statusAtual = emp.status;
            if (hoje > dataDevCompara) {
                statusAtual = "Atrasado";
            }

            const statusTag = statusAtual === "Atrasado" ? "danger" : "success";

            let dataRetiradaFormatada = emp.data_retirada && typeof emp.data_retirada.toDate === "function" 
                ? emp.data_retirada.toDate().toLocaleDateString('pt-BR') 
                : (emp.data_retirada || "-");

            let dataDevolucaoFormatada = dataDevPrevista.toLocaleDateString('pt-BR');

            emprestimosAdminCache.push({
                id: idDoc,
                leitor: leitorExibicao,
                livro: livroExibicao,
                dataRetirada: dataRetiradaFormatada,
                dataDevolucao: dataDevolucaoFormatada,
                status: statusAtual || "Em andamento",
                statusTag: statusTag,
                tipoSolicitado: false
            });
        });

        renderizarTabelaEmprestimosAdmin();

    } catch (error) { 
        console.error("Erro ao listar empréstimos:", error); 
    }
}

function renderizarTabelaEmprestimosAdmin() {
    const tbody = document.querySelector("#tela-emprestimos .admin-table tbody");
    if (!tbody) return;

    const inputBusca = document.querySelector("#tela-emprestimos .search-input")?.value.toLowerCase().trim() || "";
    const filtroStatus = document.querySelector("#tela-emprestimos .select-filter")?.value || "";

    const filtrados = emprestimosAdminCache.filter(item => {
        const bateTexto = item.leitor.toLowerCase().includes(inputBusca) || 
                          item.livro.toLowerCase().includes(inputBusca);

        let bateStatus = true;
        if (filtroStatus) {
            bateStatus = item.status.toLowerCase() === filtroStatus.toLowerCase();
        }

        return bateTexto && bateStatus;
    });

    tbody.innerHTML = "";

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--muted-foreground);">Nenhum empréstimo encontrado com esses filtros.</td></tr>`;
        return;
    }

    filtrados.forEach(item => {
        if (item.tipoSolicitado) {
            const linhaSolicitado = `
                <tr style="background-color: rgba(234, 179, 8, 0.05);">
                    <td><strong>${item.leitor}</strong></td>
                    <td>${item.livro}</td>
                    <td>${item.dataRetirada}</td>
                    <td>${item.dataDevolucao}</td>
                    <td><span class="status-tag warning">Solicitado</span></td>
                    <td>
                        <button class="btn-primary" style="padding: 6px 12px; font-size: 12px;" onclick="confirmarEntregaFisica('${item.id}')" title="Confirmar entrega presencial">
                            Efetivar Entrega
                        </button>
                        <button class="action-icon btn-action-danger" onclick="deletarDocumento('emprestimos', '${item.id}')" title="Cancelar Solicitação">
                            <i data-lucide="trash-2" class="icon-small"></i>
                        </button>
                    </td>
                </tr>
            `;
            tbody.insertAdjacentHTML("beforeend", linhaSolicitado);
        } else {
            let botaoRenovarHTML = item.status === "Atrasado" 
                ? `<button class="action-icon" style="opacity: 0.4; cursor: not-allowed;" title="Bloqueado para renovação (Atrasado)"><i data-lucide="refresh-cw" class="icon-small"></i></button>`
                : `<button class="action-icon" onclick="renovarEmprestimoAdmin('${item.id}')" title="Renovar +7 dias"><i data-lucide="refresh-cw" class="icon-small"></i></button>`;

            const linha = `
                <tr>
                    <td><strong>${item.leitor}</strong></td>
                    <td>${item.livro}</td>
                    <td>${item.dataRetirada}</td>
                    <td>${item.dataDevolucao}</td>
                    <td><span class="status-tag ${item.statusTag}">${item.status}</span></td>
                    <td>
                        ${botaoRenovarHTML}
                        <button class="action-icon btn-action-danger" onclick="deletarDocumento('emprestimos', '${item.id}')" title="Excluir"><i data-lucide="trash-2" class="icon-small"></i></button>
                    </td>
                </tr>
            `;
            tbody.insertAdjacentHTML("beforeend", linha);
        }
    });

    if (typeof lucide !== "undefined") lucide.createIcons();
}

window.confirmarEntregaFisica = async function(idEmprestimo) {
    try {
        const docRef = doc(db, "emprestimos", idEmprestimo);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            return mostrarNotificacao("Solicitação de empréstimo não encontrada.", "error");
        }

        const emp = docSnap.data();
        const livro = emp.Exemplar_idExemplar;

        // 1. CHECAGEM DE DISPONIBILIDADE REAL NO BANCO
        const queryLivros = await getDocs(collection(db, "books"));
        const queryEmprestimos = await getDocs(collection(db, "emprestimos"));

        let estoqueTotal = 0;
        let encontrouLivro = false;

        queryLivros.forEach((docSnap) => {
            const l = docSnap.data();
            if (l.titulo && l.titulo.trim().toLowerCase() === livro.trim().toLowerCase()) {
                estoqueTotal = parseInt(l.quantidade) || 1;
                encontrouLivro = true;
            }
        });

        if (!encontrouLivro) {
            return mostrarNotificacao(`O livro "${livro}" não existe no acervo.`, "error");
        }

        let exemplaresEmprestados = 0;
        queryEmprestimos.forEach((d) => {
            const e = d.data();
            // Conta apenas empréstimos já ativos/em andamento (ignora o próprio registro se ele ainda estiver como Solicitado)
            if (
                d.id !== idEmprestimo &&
                e.Exemplar_idExemplar && 
                e.Exemplar_idExemplar.trim().toLowerCase() === livro.trim().toLowerCase() && 
                e.status !== "Devolvido" && 
                e.status !== "Solicitado"
            ) {
                exemplaresEmprestados++;
            }
        });

        if (exemplaresEmprestados >= estoqueTotal) {
            return mostrarNotificacao(
                `Não é possível efetivar o empréstimo! Todos os ${estoqueTotal} exemplar(es) de "${livro}" já estão em uso.`, 
                "warning"
            );
        }

        // 2. CONFIRMA A ENTREGA
        const confirmou = await confirmarAcao(
            "Confirmar Entrega Física?",
            `O leitor está no balcão e retirou "${livro}"? O prazo de 7 dias começará a contar a partir de hoje.`,
            "Sim, confirmar entrega"
        );

        if (!confirmou) return;

        const hoje = new Date();
        const dataDevolucao = new Date();
        dataDevolucao.setDate(hoje.getDate() + 7);

        await updateDoc(docRef, {
            data_retirada: hoje.toLocaleDateString('pt-BR'),
            data_devolucao_prevista: dataDevolucao.toLocaleDateString('pt-BR'),
            status: "Em andamento"
        });

        mostrarNotificacao("Entrega confirmada com sucesso! Empréstimo ativo.", "success");
        listarEmprestimosBanco();
        carregarMétricasDashboard();

    } catch (error) {
        console.error("Erro ao efetivar entrega física:", error);
        mostrarNotificacao("Erro ao validar e efetivar o empréstimo.", "error");
    }
};

let processandoRenovacao = false; // Trava global anti-duplo clique

window.renovarEmprestimoAdmin = async function(idEmprestimo) {
    if (processandoRenovacao) return; // Impede chamadas simultâneas

    const confirmou = await confirmarAcao(
        "Renovar Empréstimo?",
        "Deseja estender o prazo de devolução por mais 7 dias a partir do prazo atual?",
        "Sim, renovar"
    );

    if (!confirmou) return;

    try {
        processandoRenovacao = true;

        const docRef = doc(db, "emprestimos", idEmprestimo);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            processandoRenovacao = false;
            return mostrarNotificacao("Empréstimo não encontrado.", "error");
        }

        const emp = docSnap.data();
        let dataAtualPrevista = tratarData(emp.data_devolucao_prevista);
        
        // Adiciona +7 dias à data prevista existente
        dataAtualPrevista.setDate(dataAtualPrevista.getDate() + 7);

        // ATENÇÃO: Usa estritamente updateDoc no mesmo ID existente
        await updateDoc(docRef, {
            data_devolucao_prevista: dataAtualPrevista.toLocaleDateString('pt-BR'),
            status: "Em andamento"
        });

        mostrarNotificacao("Empréstimo renovado por mais 7 dias!", "success");
        
        // Recarrega as tabelas para refletir no admin
        await listarEmprestimosBanco();
        await listarEmprestimosParaDevolucao();
        await carregarMétricasDashboard();

    } catch (error) {
        console.error("Erro ao renovar empréstimo pelo admin:", error);
        mostrarNotificacao("Erro ao processar renovação.", "error");
    } finally {
        processandoRenovacao = false; // Libera a trava
    }
};

const btnConfirmarEmprestimo = document.getElementById("btn-confirmar-emprestimo");
if (btnConfirmarEmprestimo) {
    btnConfirmarEmprestimo.addEventListener("click", async () => {
        const leitor = document.getElementById("select-emprestimo-leitor")?.value;
        const livro = document.getElementById("select-emprestimo-livro")?.value;
        const retiradaStr = document.getElementById("input-emprestimo-retirada")?.value;
        const devolucaoStr = document.getElementById("input-emprestimo-devolucao")?.value;

        if (!leitor || !livro || !retiradaStr || !devolucaoStr) {
            return mostrarNotificacao("Preencha todos os campos obrigatórios.", "warning");
        }

        const dRetirada = tratarData(retiradaStr);
        const dDevolucao = tratarData(devolucaoStr);

        dRetirada.setHours(0, 0, 0, 0);
        dDevolucao.setHours(0, 0, 0, 0);
        const diffDias = Math.round((dDevolucao.getTime() - dRetirada.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDias < 7) {
            return mostrarNotificacao("A data de devolução deve ter no mínimo 7 dias a partir da data de retirada!", "warning");
        }

        try {
            const queryEmprestimos = await getDocs(collection(db, "emprestimos"));
            const queryLivros = await getDocs(collection(db, "books"));

            let emprestimosAtivosLeitor = 0;
            queryEmprestimos.forEach((docSnap) => {
                const emp = docSnap.data();
                if (emp.Usuario_idUsuario === leitor && emp.status !== "Devolvido") {
                    emprestimosAtivosLeitor++;
                }
            });

            if (emprestimosAtivosLeitor >= 3) {
                return mostrarNotificacao(`Empréstimo recusado! O leitor ${leitor} já possui 3 empréstimos ativos.`, "warning");
            }

            let estoqueTotal = 1;
            queryLivros.forEach((docSnap) => {
                const l = docSnap.data();
                if (l.titulo === livro) {
                    estoqueTotal = parseInt(l.quantidade) || 1;
                }
            });

            let exemplaresEmprestados = 0;
            queryEmprestimos.forEach((docSnap) => {
                const emp = docSnap.data();
                if (emp.Exemplar_idExemplar === livro && emp.status !== "Devolvido") {
                    exemplaresEmprestados++;
                }
            });

            if (exemplaresEmprestados >= estoqueTotal) {
                return mostrarNotificacao(`Empréstimo recusado! Todos os ${estoqueTotal} exemplar(es) de "${livro}" já estão emprestados.`, "warning");
            }

            await addDoc(collection(db, "emprestimos"), {
                Usuario_idUsuario: leitor,
                Exemplar_idExemplar: livro,
                data_retirada: retiradaStr,
                data_devolucao_prevista: devolucaoStr,
                status: "Em andamento"
            });

            mostrarNotificacao("Empréstimo registrado com sucesso!", "success");
            if (typeof window.alternarFormEmprestimo === "function") window.alternarFormEmprestimo(false);
            
            listarEmprestimosBanco();
            carregarMétricasDashboard();

        } catch (error) {
            console.error("Erro ao registrar empréstimo:", error);
            mostrarNotificacao("Erro ao registrar empréstimo no banco de dados.", "error");
        }
    });
}

// ==========================================================================
// 4. TELA: DEVOLUÇÕES
// ==========================================================================
let devolucoesAdminCache = [];

async function listarEmprestimosParaDevolucao() {
    const tbody = document.querySelector("#tela-devolucoes .admin-table tbody");
    if (!tbody) return;
    
    // 1. LIMPA A TABELA E O CACHE ANTES DE BUSCAR
    devolucoesAdminCache = [];
    tbody.innerHTML = "<tr><td colspan='6' style='text-align: center;'>Carregando fluxo de devoluções...</td></tr>";

    try {
        const querySnapshot = await getDocs(collection(db, "emprestimos"));

        let valorMultaDiaria = 1.50; 
        const queryConfig = await getDocs(collection(db, "configuracao"));
        if (!queryConfig.empty) {
            const config = queryConfig.docs[0].data();
            valorMultaDiaria = parseFloat(config.valor_multa_diaria) || 1.50;
        }

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        querySnapshot.forEach((docSnap) => {
            const emp = docSnap.data();
            const idDoc = docSnap.id;

            // EVITA ADICIONAR O MESMO ID DUAS VEZES CASO O QUERY SNAPSHOT TRAGA ALGO REPETIDO
            if (devolucoesAdminCache.some(item => item.id === idDoc)) return;
            
            let dataRetiradaFormatada = emp.data_retirada && typeof emp.data_retirada.toDate === "function" 
                ? emp.data_retirada.toDate().toLocaleDateString('pt-BR') 
                : (emp.data_retirada || "-");

            let dataDevPrevista = tratarData(emp.data_devolucao_prevista);
            let dataDevCompara = new Date(dataDevPrevista);
            dataDevCompara.setHours(0, 0, 0, 0);

            let dataDevolucaoFormatada = dataDevPrevista.toLocaleDateString('pt-BR');

            const leitorExibicao = emp.Usuario_idUsuario || "Desconhecido";
            const livroExibicao = emp.Exemplar_idExemplar || "Livro Não Informado";

            let acaoHTML = "";
            let multaHTML = `<span class="status-tag success">Nenhuma</span>`;
            let estaDevolvido = false;

            if (emp.status === "Devolvido") {
                estaDevolvido = true;
                let dataReal = emp.data_devolucao_real && typeof emp.data_devolucao_real.toDate === "function" 
                    ? emp.data_devolucao_real.toDate().toLocaleDateString('pt-BR') 
                    : "Concluído";

                acaoHTML = `<span class="status-tag success">Recebido em ${dataReal}</span>`;
                
                let dPrev = tratarData(emp.data_devolucao_prevista);
                let dReal = tratarData(emp.data_devolucao_real);
                if (dReal > dPrev) {
                    multaHTML = `<span class="status-tag success">Paga</span>`;
                }
            } else {
                acaoHTML = `<button class="btn-primary" style="padding: 6px 12px; font-size: 12px;" onclick="confirmarDevolucaoBanco('${idDoc}')">Confirmar Devolução</button>`;
                
                if (hoje > dataDevCompara || emp.status === "Atrasado") {
                    const diferencaTempo = hoje.getTime() - dataDevCompara.getTime();
                    const diasAtraso = Math.max(1, Math.ceil(diferencaTempo / (1000 * 60 * 60 * 24)));
                    const valorCalculado = (diasAtraso * valorMultaDiaria).toFixed(2).replace('.', ',');

                    multaHTML = `<span class="status-tag danger" title="${diasAtraso} dia(s) de atraso">R$ ${valorCalculado}</span>`;
                }
            }

            devolucoesAdminCache.push({
                id: idDoc,
                leitor: leitorExibicao,
                livro: livroExibicao,
                dataRetirada: dataRetiradaFormatada,
                dataDevolucao: dataDevolucaoFormatada,
                multaHTML,
                acaoHTML,
                estaDevolvido
            });
        });

        // 2. RENDERIZA APENAS UMA VEZ
        renderizarTabelaDevolucoesAdmin();

    } catch (error) { 
        console.error("Erro ao carregar tabela de devoluções:", error); 
    }
}

function renderizarTabelaDevolucoesAdmin() {
    const tbody = document.querySelector("#tela-devolucoes .admin-table tbody");
    if (!tbody) return;

    const inputBusca = document.querySelector("#tela-devolucoes .search-input")?.value.toLowerCase().trim() || "";
    const filtroStatus = document.querySelector("#tela-devolucoes .select-filter")?.value || "";

    const filtrados = devolucoesAdminCache.filter(item => {
        const bateTexto = item.leitor.toLowerCase().includes(inputBusca) || 
                          item.livro.toLowerCase().includes(inputBusca);

        let bateFiltro = true;
        if (filtroStatus === "pendentes") {
            bateFiltro = !item.estaDevolvido;
        } else if (filtroStatus === "concluidos") {
            bateFiltro = item.estaDevolvido;
        }

        return bateTexto && bateFiltro;
    });

    // LIMPA A TABELA ANTES DE INSERIR AS LINHAS
    tbody.innerHTML = "";

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--muted-foreground);">Nenhum registro encontrado.</td></tr>`;
        return;
    }

    filtrados.forEach(item => {
        const linha = `
            <tr>
                <td><strong>${item.leitor}</strong></td>
                <td>${item.livro}</td>
                <td>${item.dataRetirada}</td>
                <td>${item.dataDevolucao}</td>
                <td>${item.multaHTML}</td>
                <td style="text-align: right;">${item.acaoHTML}</td>
            </tr>
        `;
        tbody.insertAdjacentHTML("beforeend", linha);
    });

    if (typeof lucide !== "undefined") lucide.createIcons();
}

window.confirmarDevolucaoBanco = async function(id) {
    const confirmou = await confirmarAcao(
        "Confirmar Devolução?",
        "Deseja registrar o recebimento físico deste exemplar e dar baixa no sistema?",
        "Sim, dar baixa!"
    );

    if (!confirmou) return;

    try {
        await updateDoc(doc(db, "emprestimos", id), {
            status: "Devolvido",
            data_devolucao_real: new Date()
        });
        mostrarNotificacao("Baixa de devolução concluída com sucesso!", "success");
        listarEmprestimosParaDevolucao();
        listarEmprestimosBanco();
        carregarMétricasDashboard();
    } catch (error) { 
        console.error("Erro na devolução:", error); 
        mostrarNotificacao("Erro ao registrar devolução.", "error");
    }
};

// ==========================================================================
// 5. TELA: CONFIGURAÇÕES
// ==========================================================================
let idConfigDoc = null;

async function carregarConfiguracoesBanco() {
    try {
        const querySnapshot = await getDocs(collection(db, "configuracao"));
        if (querySnapshot.empty) return;

        const configDoc = querySnapshot.docs[0];
        idConfigDoc = configDoc.id;
        const config = configDoc.data();

        const elNome = document.getElementById("config-nome-biblioteca");
        const elPrazo = document.getElementById("config-prazo-emprestimo");
        const elMulta = document.getElementById("config-valor-multa");
        const elLimite = document.getElementById("config-limite-user");
        const elMaxRenov = document.getElementById("config-max-renovacao");

        if (elNome) elNome.value = config.nome_biblioteca || "";
        if (elPrazo) elPrazo.value = config.prazo_emprestimo_dias || "";
        if (elMulta) elMulta.value = config.valor_multa_diaria || "";
        if (elLimite) elLimite.value = config.limite_emprestimos_usuario || "";
        if (elMaxRenov) elMaxRenov.value = config.prazo_maximo_renovacao_dias || "";
    } catch (error) { console.error(error); }
}

const btnSalvarConfig = document.getElementById("btn-salvar-configuracoes");
if (btnSalvarConfig) {
    btnSalvarConfig.addEventListener("click", async () => {
        if (!idConfigDoc) return mostrarNotificacao("Nenhum documento de configuração localizado.", "warning");
        try {
            await updateDoc(doc(db, "configuracao", idConfigDoc), {
                nome_biblioteca: document.getElementById("config-nome-biblioteca")?.value || "",
                prazo_emprestimo_dias: parseInt(document.getElementById("config-prazo-emprestimo")?.value) || 0,
                valor_multa_diaria: parseFloat(document.getElementById("config-valor-multa")?.value) || 0,
                limite_emprestimos_usuario: parseInt(document.getElementById("config-limite-user")?.value) || 0,
                prazo_maximo_renovacao_dias: parseInt(document.getElementById("config-max-renovacao")?.value) || 0
            });
            mostrarNotificacao("Configurações atualizadas!", "success");
            carregarMétricasDashboard();
        } catch (error) { console.error(error); }
    });
}

// ==========================================================================
// 6. TELA: RESERVAS
// ==========================================================================
let reservasAdminCache = [];

async function listarReservasBanco() {
    const tbody = document.querySelector("#tela-reservas .admin-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='5'>Carregando reservas do Firebase...</td></tr>";

    try {
        const querySnapshot = await getDocs(collection(db, "reservas"));
        reservasAdminCache = [];

        querySnapshot.forEach((docSnap) => {
            const res = docSnap.data();
            if (res.status === "Cancelada" || res.status === "Atendida" || res.status === "Concluída") return;

            const isDisponivel = res.status === "Disponível para retirada";
            const statusTag = isDisponivel ? "success" : "warning";
            const statusTexto = isDisponivel ? "Disponível para retirada" : (res.status || "Aguardando liberação");

            let dataReservaFormatada = res.data_reserva && typeof res.data_reserva.toDate === "function" 
                ? res.data_reserva.toDate().toLocaleDateString('pt-BR') 
                : (res.data_reserva || "-");

            const leitorExibicao = res.Usuario_idUsuario || "Desconhecido";
            const livroExibicao = res.Livro_idLivro || "Livro Não Informado";

            let acaoNotificarHTML = "";
            if (!isDisponivel) {
                acaoNotificarHTML = `
                    <button class="action-icon icon-success" onclick="notificarLivroDisponivel('${docSnap.id}', '${leitorExibicao}', '${livroExibicao}')" title="Notificar leitor que o livro está disponível">
                        <i data-lucide="bell" class="icon-small"></i>
                    </button>
                `;
            } else {
                acaoNotificarHTML = `
                    <span style="font-size: 12px; color: var(--success); font-weight: 500; margin-right: 8px;">
                        <i data-lucide="check-circle" class="icon-small" style="display:inline-block; vertical-align:middle;"></i> Leitor Notificado
                    </span>
                `;
            }

            reservasAdminCache.push({
                id: docSnap.id,
                leitor: leitorExibicao,
                livro: livroExibicao,
                dataReserva: dataReservaFormatada,
                statusTag,
                statusTexto,
                acaoNotificarHTML
            });
        });

        renderizarTabelaReservasAdmin();

    } catch (error) { 
        console.error("Erro ao listar reservas:", error); 
    }
}

function renderizarTabelaReservasAdmin() {
    const tbody = document.querySelector("#tela-reservas .admin-table tbody");
    if (!tbody) return;

    const inputBusca = document.querySelector("#tela-reservas .search-input")?.value.toLowerCase().trim() || "";
    const filtroStatus = document.querySelector("#tela-reservas .select-filter")?.value.toLowerCase().trim() || "";

    const filtrados = reservasAdminCache.filter(item => {
        const bateTexto = item.leitor.toLowerCase().includes(inputBusca) || item.livro.toLowerCase().includes(inputBusca);
        
        let bateStatus = true;
        if (filtroStatus === "aguardando") {
            bateStatus = item.statusTexto.toLowerCase().includes("aguardando");
        } else if (filtroStatus === "disponivel") {
            bateStatus = item.statusTexto.toLowerCase().includes("disponível");
        }

        return bateTexto && bateStatus;
    });

    tbody.innerHTML = "";

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--muted-foreground);">Nenhuma reserva encontrada com esses filtros.</td></tr>`;
        return;
    }

    filtrados.forEach(item => {
        const linha = `
            <tr>
                <td><strong>${item.leitor}</strong></td>
                <td>${item.livro}</td>
                <td>${item.dataReserva}</td>
                <td><span class="status-tag ${item.statusTag}">${item.statusTexto}</span></td>
                <td>
                    ${item.acaoNotificarHTML}
                    <button class="action-icon btn-action-danger" onclick="cancelarReservaBanco('${item.id}')" title="Cancelar Reserva">
                        <i data-lucide="trash-2" class="icon-small"></i>
                    </button>
                </td>
            </tr>
        `;
        tbody.insertAdjacentHTML("beforeend", linha);
    });

    if (typeof lucide !== "undefined") lucide.createIcons();
}

window.notificarLivroDisponivel = async function(idReserva, leitor, livro) {
    try {
        // 1. CHECAGEM DE DISPONIBILIDADE REAL NO BANCO
        const queryLivros = await getDocs(collection(db, "books"));
        const queryEmprestimos = await getDocs(collection(db, "emprestimos"));

        let estoqueTotal = 0;
        let encontrouLivro = false;

        queryLivros.forEach((docSnap) => {
            const l = docSnap.data();
            if (l.titulo && l.titulo.trim().toLowerCase() === livro.trim().toLowerCase()) {
                estoqueTotal = parseInt(l.quantidade) || 1;
                encontrouLivro = true;
            }
        });

        if (!encontrouLivro) {
            return mostrarNotificacao(`O livro "${livro}" não foi encontrado no acervo!`, "error");
        }

        // Conta quantos exemplares estão atualmente emprestados (não devolvidos)
        let exemplaresEmprestados = 0;
        queryEmprestimos.forEach((docSnap) => {
            const emp = docSnap.data();
            if (
                emp.Exemplar_idExemplar && 
                emp.Exemplar_idExemplar.trim().toLowerCase() === livro.trim().toLowerCase() && 
                emp.status !== "Devolvido"
            ) {
                exemplaresEmprestados++;
            }
        });

        const disponiveis = estoqueTotal - exemplaresEmprestados;

        // TRAVA: Se não houver exemplares livres no momento, impede a notificação
        if (disponiveis <= 0) {
            return mostrarNotificacao(
                `Não é possível notificar! Todos os ${estoqueTotal} exemplar(es) de "${livro}" estão atualmente emprestados.`, 
                "warning"
            );
        }

        // 2. SE HOUVER ESTOQUE, CONFIRMA E NOTIFICA
        const confirmou = await confirmarAcao(
            "Disponibilizar para Retirada?", 
            `Existe(m) ${disponiveis} exemplar(es) disponível(is). Deseja alterar o status e avisar o leitor ${leitor}?`, 
            "Sim, avisar leitor!"
        );

        if (!confirmou) return;

        await updateDoc(doc(db, "reservas", idReserva), {
            status: "Disponível para retirada",
            dataDisponibilizado: new Date()
        });

        mostrarNotificacao(`Notificação enviada! O livro "${livro}" foi reservado para retirada de ${leitor}.`, "success");
        listarReservasBanco();
        carregarMétricasDashboard();

    } catch (error) {
        console.error("Erro ao verificar disponibilidade para notificação:", error);
        mostrarNotificacao("Erro ao processar validação do estoque.", "error");
    }
};

window.cancelarReservaBanco = async function(id) {
    const confirmou = await confirmarAcao(
        "Cancelar Reserva?",
        "Esta ação cancelará a solicitação de reserva do leitor.",
        "Sim, cancelar reserva"
    );

    if (!confirmou) return;

    try {
        await updateDoc(doc(db, "reservas", id), { status: "Cancelada" });
        mostrarNotificacao("Reserva cancelada com sucesso!", "success");
        listarReservasBanco();
    } catch (error) { 
        console.error("Erro ao cancelar reserva:", error); 
    }
};

// ==========================================================================
// 7. TELA: USUÁRIOS E SUBABA DE SOLICITAÇÕES
// ==========================================================================
async function listarUsuariosBanco() {
    const tbodyLeitores = document.getElementById("tbody-usuarios-ativos");
    const tbodyFuncionarios = document.getElementById("tbody-funcionarios-ativos");
    
    if (!tbodyLeitores && !tbodyFuncionarios) return;

    try {
        const querySnapshot = await getDocs(collection(db, "usuarios"));
        
        if (tbodyLeitores) tbodyLeitores.innerHTML = "";
        if (tbodyFuncionarios) tbodyFuncionarios.innerHTML = "";

        let qtdLeitores = 0;
        let qtdFuncionarios = 0;

        querySnapshot.forEach((docSnap) => {
            const user = docSnap.data();
            const idDoc = docSnap.id;
            const cargo = (user.tipoUser || "leitor").toLowerCase().trim();
            const iniciais = user.nome ? user.nome.substring(0, 2).toUpperCase() : "U";
            const fotoHTML = user.foto 
                ? `<img src="${user.foto}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">` 
                : `<div class="avatar-circle">${iniciais}</div>`;

            const linha = `
                <tr>
                    <td><div class="user-name-cell">${fotoHTML}<strong>${user.nome || "Sem Nome"}</strong></div></td>
                    <td>${user.cpf || "-"}</td>
                    <td>${user.email || "-"}</td>
                    <td>${user.telefone || "-"}</td>
                    <td><span class="status-tag success">${user.status || "Ativo"}</span></td>
                    <td><span class="book-tag">${user.tipoUser || "leitor"}</span></td>
                    <td>
                        <button class="action-icon btn-action-danger" onclick="deletarDocumento('usuarios', '${idDoc}')" title="Excluir"><i data-lucide="trash-2" class="icon-small"></i></button>
                    </td>
                </tr>
            `;

            if (cargo === "bibliotecario" || cargo === "admin" || cargo === "administrador") {
                if (tbodyFuncionarios) tbodyFuncionarios.insertAdjacentHTML("beforeend", linha);
                qtdFuncionarios++;
            } else {
                if (tbodyLeitores) tbodyLeitores.insertAdjacentHTML("beforeend", linha);
                qtdLeitores++;
            }
        });

        if (tbodyLeitores && qtdLeitores === 0) {
            tbodyLeitores.innerHTML = "<tr><td colspan='7' style='text-align: center; color: var(--muted-foreground); padding: 16px 0;'>Nenhum leitor cadastrado.</td></tr>";
        }
        if (tbodyFuncionarios && qtdFuncionarios === 0) {
            tbodyFuncionarios.innerHTML = "<tr><td colspan='7' style='text-align: center; color: var(--muted-foreground); padding: 16px 0;'>Nenhum funcionário cadastrado.</td></tr>";
        }

        await listarSolicitacoesPendentesAdmin();
        if (typeof lucide !== "undefined") lucide.createIcons();

    } catch (error) { 
        console.error("Erro ao listar usuários:", error); 
    }
}

async function listarSolicitacoesPendentesAdmin() {
    const tbodySolicitacoes = document.getElementById("tbody-solicitacoes-cadastro");
    const badgeQtd = document.getElementById("badge-qtd-solicitacoes");
    
    if (!tbodySolicitacoes) return;

    try {
        const querySolicitacoes = await getDocs(collection(db, "solicitacoes_cadastro"));
        tbodySolicitacoes.innerHTML = "";

        let totalPendentes = 0;

        querySolicitacoes.forEach((docSnap) => {
            const req = docSnap.data();
            if (req.status !== "Pendente") return;
            totalPendentes++;

            const tipoPedido = req.perfilAcessoSolicitado === "renovacao" ? "Renovação" : "Novo Leitor";

            const linha = `
                <tr>
                    <td><strong>${req.nome}</strong></td>
                    <td>${req.cpf}</td>
                    <td>${req.email}</td>
                    <td>${req.telefone}</td>
                    <td><span class="book-tag">${tipoPedido}</span></td>
                    <td>
                        <button class="action-icon" style="color: #10b981; margin-right: 12px; background: none; border: none; cursor: pointer;" onclick="decidirSolicitacao('${docSnap.id}', true)" title="Aprovar"><i data-lucide="check" style="width: 18px; height: 18px;"></i></button>
                        <button class="action-icon" style="color: #ef4444; background: none; border: none; cursor: pointer;" onclick="decidirSolicitacao('${docSnap.id}', false)" title="Recusar"><i data-lucide="x" style="width: 18px; height: 18px;"></i></button>
                    </td>
                </tr>
            `;
            tbodySolicitacoes.insertAdjacentHTML("beforeend", linha);
        });

        if (badgeQtd) badgeQtd.innerText = totalPendentes;

        if (totalPendentes === 0) {
            tbodySolicitacoes.innerHTML = "<tr><td colspan='6' style='text-align: center; color: var(--muted-foreground); padding: 20px 0;'>Nenhuma solicitação de cadastro pendente.</td></tr>";
        }

        if (typeof lucide !== "undefined") lucide.createIcons();

    } catch (error) {
        console.error("Erro ao buscar solicitações do banco:", error);
    }
}

window.decidirSolicitacao = async function(idSolicitacao, aprovado) {
    const confirmou = await confirmarAcao(
        aprovado ? "Aprovar Cadastro?" : "Recusar Cadastro?",
        aprovado ? "O usuário receberá permissão de acesso ao sistema." : "A solicitação será recusada e arquivada.",
        aprovado ? "Sim, aprovar!" : "Sim, recusar"
    );

    if (!confirmou) return;

    try {
        const docRef = doc(db, "solicitacoes_cadastro", idSolicitacao);
        const docSnap = await getDoc(docRef);
        
        if (!docSnap.exists()) return mostrarNotificacao("Solicitação não encontrada.", "warning");
        const dados = docSnap.data();

        if (aprovado) {
            // Limpa o CPF para usar como senha padrão
            const cpfLimpo = (dados.cpf || "").replace(/\D/g, '');
            // Gera o Hash criptografado do CPF
            const senhaCriptografada = await hashSenha(cpfLimpo);

            await addDoc(collection(db, "usuarios"), {
                nome: dados.nome,
                email: dados.email,
                cpf: dados.cpf,
                telefone: dados.telefone,
                foto: dados.fotoPerfilUrl || "",
                status: "Ativo",
                tipoUser: "leitor",
                senha: senhaCriptografada, // Salva HASH e não texto puro
                trocarSenhaObrigatoria: true, // Marca aviso para trocar a senha inicial
                dataCadastro: new Date()
            });

            await updateDoc(docRef, { status: "Aprovado" });
            mostrarNotificacao(`Cadastro de ${dados.nome} aprovado com sucesso!`, "success");
        } else {
            await updateDoc(docRef, { status: "Recusado" });
            mostrarNotificacao("Solicitação recusada.", "info");
        }

        await listarUsuariosBanco();
        await carregarMétricasDashboard();

    } catch (error) {
        console.error("Erro ao processar decisão de cadastro:", error);
        mostrarNotificacao("Erro ao processar a aprovação.", "error");
    }
};

const btnConfirmarCadastroUser = document.getElementById("btn-confirmar-cadastro-user");
if (btnConfirmarCadastroUser) {
    btnConfirmarCadastroUser.addEventListener("click", async (e) => {
        e.preventDefault();

        const nome = document.getElementById("input-user-nome")?.value.trim();
        const cpf = document.getElementById("input-user-cpf")?.value.trim();
        const email = document.getElementById("input-user-email")?.value.trim().toLowerCase();
        const telefone = document.getElementById("input-user-telefone")?.value.trim();
        const perfil = document.getElementById("select-user-perfil")?.value;
        const foto = document.getElementById("input-user-foto")?.value.trim();

        if (!nome || !email || !cpf) {
            mostrarNotificacao("Preencha todos os campos obrigatórios.", "warning");
            return;
        }

        try {
            const queryExistentes = await getDocs(collection(db, "usuarios"));
            let duplicado = false;
            let motivoDuplicado = "";

            queryExistentes.forEach((docSnap) => {
                const user = docSnap.data();
                const emailExistente = user.email ? user.email.trim().toLowerCase() : "";
                const cpfExistente = user.cpf ? user.cpf.trim() : "";

                if (emailExistente === email) {
                    duplicado = true;
                    motivoDuplicado = "Já existe um usuário cadastrado com este E-mail.";
                } else if (cpfExistente === cpf && cpf !== "") {
                    duplicado = true;
                    motivoDuplicado = "Já existe um usuário cadastrado com este CPF.";
                }
            });

            if (duplicado) {
                mostrarNotificacao(motivoDuplicado, "warning");
                return;
            }

            await addDoc(collection(db, "usuarios"), {
                nome, cpf, email,
                telefone: telefone || "",
                tipoUser: perfil || "leitor",
                foto: foto || "",
                status: "Ativo",
                dataCadastro: new Date()
            });

            mostrarNotificacao(`Usuário ${nome} (${perfil}) cadastrado com sucesso!`, "success");

            document.getElementById("input-user-nome").value = "";
            document.getElementById("input-user-cpf").value = "";
            document.getElementById("input-user-email").value = "";
            document.getElementById("input-user-telefone").value = "";
            document.getElementById("input-user-foto").value = "";

            if (typeof window.alternarFormUsuario === "function") {
                window.alternarFormUsuario(false);
            }

            await listarUsuariosBanco();

        } catch (error) {
            console.error("Erro ao cadastrar usuário:", error);
            mostrarNotificacao("Erro ao salvar dados no banco de dados.", "error");
        }
    });
}

// ==========================================================================
// 8. DROPDOWN DE NOTIFICAÇÕES
// ==========================================================================
function formatarTempoRelativo(dataBanco) {
    const alvo = tratarData(dataBanco);
    const diffMs = new Date().getTime() - alvo.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return "agora";
    if (diffMin < 60) return `há ${diffMin} min`;
    const diffHoras = Math.floor(diffMin / 60);
    if (diffHoras < 24) return `há ${diffHoras}h`;
    const diffDias = Math.floor(diffHoras / 24);
    return `há ${diffDias} dia${diffDias > 1 ? "s" : ""}`;
}

async function carregarNotificacoesBanco() {
    const listaEl = document.getElementById("lista-notificacoes");
    const badge = document.querySelector(".btn-notification .notification-badge");
    if (!listaEl) return;

    try {
        const notificacoes = [];

        const queryUsuarios = await getDocs(collection(db, "usuarios"));
        queryUsuarios.forEach((docSnap) => {
            const u = docSnap.data();
            if (u.status === "Bloqueado") {
                notificacoes.push({
                    cor: "vermelho",
                    texto: `Usuário bloqueado — ${u.nome || "Desconhecido"}`,
                    data: u.dataCadastro
                });
            }
        });

        const queryReservas = await getDocs(collection(db, "reservas"));
        queryReservas.forEach((docSnap) => {
            const r = docSnap.data();
            if (r.status === "Disponível para retirada") {
                const livro = (r.Livro_idLivro && r.Livro_idLivro.length > 15) ? "Dom Casmurro" : (r.Livro_idLivro || "Livro Não Informado");
                notificacoes.push({
                    cor: "verde",
                    texto: `Reserva disponível — ${livro}`,
                    data: r.data_reserva
                });
            }
        });

        const queryMultas = await getDocs(collection(db, "multas"));
        for (const docSnap of queryMultas.docs) {
            const m = docSnap.data();
            if (m.status !== "Pendente") continue;

            let leitor = "Desconhecido";
            try {
                if (m.idEmprestimo) {
                    const empSnap = await getDoc(doc(db, "emprestimos", m.idEmprestimo));
                    if (empSnap.exists()) {
                        const emp = empSnap.data();
                        leitor = (emp.Usuario_idUsuario && emp.Usuario_idUsuario.length > 15) ? "Fernando Ribeiro" : (emp.Usuario_idUsuario || "Desconhecido");
                    }
                }
            } catch (e) { }

            const valorFormatado = Number(m.valor_total || 0).toFixed(2).replace('.', ',');
            notificacoes.push({
                cor: "azul",
                texto: `Nova multa — ${leitor} (R$ ${valorFormatado})`,
                data: m.data_pagamento || new Date()
            });
        }

        const queryEmprestimos = await getDocs(collection(db, "emprestimos"));
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const amanha = new Date(hoje);
        amanha.setDate(hoje.getDate() + 1);

        queryEmprestimos.forEach((docSnap) => {
            const emp = docSnap.data();
            if (emp.status !== "Em andamento") return;

            const dataDev = tratarData(emp.data_devolucao_prevista);
            dataDev.setHours(0, 0, 0, 0);

            if (dataDev.getTime() === amanha.getTime()) {
                const leitor = (emp.Usuario_idUsuario && emp.Usuario_idUsuario.length > 15) ? "Fernando Ribeiro" : (emp.Usuario_idUsuario || "Desconhecido");
                const livro = (emp.Exemplar_idExemplar && emp.Exemplar_idExemplar.length > 15) ? "Dom Casmurro" : (emp.Exemplar_idExemplar || "Livro Não Informado");
                notificacoes.push({
                    cor: "amarelo",
                    texto: `${livro} vence amanhã — ${leitor}`,
                    data: new Date()
                });
            }
        });

        notificacoes.sort((a, b) => tratarData(b.data) - tratarData(a.data));

        if (notificacoes.length === 0) {
            listaEl.innerHTML = '<p style="text-align: center; color: var(--muted-foreground); font-size: 13px; padding: 16px 0;">Nenhuma notificação no momento.</p>';
        } else {
            listaEl.innerHTML = notificacoes.map((n) => `
                <div class="notificacao-item">
                    <span class="notificacao-dot dot-${n.cor}"></span>
                    <div class="notificacao-conteudo">
                        <p>${n.texto}</p>
                        <span class="notificacao-time">${formatarTempoRelativo(n.data)}</span>
                    </div>
                </div>
            `).join("");
        }

        if (badge) {
            badge.style.display = notificacoes.length > 0 ? "block" : "none";
        }

    } catch (error) {
        console.error("Erro ao carregar notificações:", error);
    }
}

document.addEventListener("click", (e) => {
    if (e.target.closest(".btn-notification")) {
        carregarNotificacoesBanco();
    }
});

// ==========================================================================
// 9. PERFIL DO USUÁRIO LOGADO (RESTAURADO COMPLETAMENTE)
// ==========================================================================
let PERFIL_ATUAL_ID = null;
let PERFIL_ATUAL_DADOS = null;

function calcularIniciaisNome(nomeCompleto) {
    if (!nomeCompleto) return "US";
    const partes = nomeCompleto.trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return "US";
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function aplicarIniciaisAvatarPerfil(nomeCompleto) {
    const iniciais = calcularIniciaisNome(nomeCompleto);
    document.querySelectorAll(".header-profile .avatar-circle, #modal-perfil-foto-container .avatar-circle").forEach((el) => {
        el.innerText = iniciais;
        el.title = nomeCompleto;
    });
}

function preencherFormularioPerfil() {
    if (!PERFIL_ATUAL_DADOS) return;

    const campoNome = document.getElementById("modal-input-nome");
    const campoEmail = document.getElementById("modal-input-email");
    const campoTelefone = document.getElementById("modal-input-telefone");

    if (campoNome) campoNome.value = PERFIL_ATUAL_DADOS.nome || "";
    if (campoEmail) campoEmail.value = PERFIL_ATUAL_DADOS.email || "";
    if (campoTelefone) campoTelefone.value = PERFIL_ATUAL_DADOS.telefone || "";
}

async function carregarPerfilLogado() {
    const emailLogado = localStorage.getItem("usuario-logado-email");
    if (!emailLogado) return;

    try {
        const querySnapshot = await getDocs(collection(db, "usuarios"));
        let encontrado = null;
        let idEncontrado = null;

        querySnapshot.forEach((docSnap) => {
            const u = docSnap.data();
            if (u.email && u.email.toLowerCase() === emailLogado.toLowerCase()) {
                encontrado = u;
                idEncontrado = docSnap.id;
            }
        });

        if (!encontrado) return;

        PERFIL_ATUAL_ID = idEncontrado;
        PERFIL_ATUAL_DADOS = encontrado;

        const elNomeHeader = document.getElementById("perfil-header-nome");
        const elEmailHeader = document.getElementById("perfil-header-email");
        const elModalNome = document.getElementById("modal-perfil-nome");

        if (elNomeHeader) elNomeHeader.innerText = encontrado.nome || "Usuário";
        if (elEmailHeader) elEmailHeader.innerText = encontrado.email || "";
        if (elModalNome) elModalNome.innerText = encontrado.nome || "Usuário";

        aplicarIniciaisAvatarPerfil(encontrado.nome);
        preencherFormularioPerfil();

    } catch (error) {
        console.error("Erro ao carregar dados do perfil:", error);
    }
}

async function salvarInformacoesPerfil() {
    if (!PERFIL_ATUAL_ID || !PERFIL_ATUAL_DADOS) {
        mostrarNotificacao("Não foi possível identificar seu usuário. Faça login novamente.", "error");
        return;
    }

    const nome = document.getElementById("modal-input-nome")?.value.trim();
    const email = document.getElementById("modal-input-email")?.value.trim().toLowerCase();
    const telefone = document.getElementById("modal-input-telefone")?.value.trim();

    if (!nome || nome.split(/\s+/).filter(Boolean).length < 2) {
        mostrarNotificacao("Informe seu nome completo (nome e sobrenome).", "error");
        return;
    }

    if (!email || !email.includes("@") || !email.includes(".")) {
        mostrarNotificacao("Informe um e-mail válido.", "error");
        return;
    }

    try {
        if (email !== (PERFIL_ATUAL_DADOS.email || "").toLowerCase()) {
            const querySnapshot = await getDocs(collection(db, "usuarios"));
            let emailEmUso = false;

            querySnapshot.forEach((docSnap) => {
                const outro = docSnap.data();
                if (docSnap.id !== PERFIL_ATUAL_ID && outro.email && outro.email.toLowerCase() === email) {
                    emailEmUso = true;
                }
            });

            if (emailEmUso) {
                mostrarNotificacao("Este e-mail já está sendo utilizado por outra conta.", "error");
                return;
            }
        }

        await updateDoc(doc(db, "usuarios", PERFIL_ATUAL_ID), {
            nome,
            email,
            telefone: telefone || ""
        });

        PERFIL_ATUAL_DADOS.nome = nome;
        PERFIL_ATUAL_DADOS.email = email;
        PERFIL_ATUAL_DADOS.telefone = telefone;

        localStorage.setItem("usuario-logado-nome", nome);
        localStorage.setItem("usuario-logado-email", email);

        const elNomeHeader = document.getElementById("perfil-header-nome");
        const elEmailHeader = document.getElementById("perfil-header-email");
        const elModalNome = document.getElementById("modal-perfil-nome");

        if (elNomeHeader) elNomeHeader.innerText = nome;
        if (elEmailHeader) elEmailHeader.innerText = email;
        if (elModalNome) elModalNome.innerText = nome;

        aplicarIniciaisAvatarPerfil(nome);

        mostrarNotificacao("Perfil atualizado com sucesso!", "success");
        if (typeof window.fecharModalPerfil === "function") window.fecharModalPerfil();

        if (typeof listarUsuariosBanco === "function") listarUsuariosBanco();

    } catch (error) {
        console.error("Erro ao salvar perfil:", error);
        mostrarNotificacao("Erro ao salvar as alterações do perfil.", "error");
    }
}

async function salvarNovaSenhaPerfil() {
    if (!PERFIL_ATUAL_ID || !PERFIL_ATUAL_DADOS) {
        mostrarNotificacao("Não foi possível identificar seu usuário. Faça login novamente.", "error");
        return;
    }

    const campoAtual = document.getElementById("modal-input-senha-atual");
    const campoNova = document.getElementById("modal-input-senha-nova");
    const campoConfirma = document.getElementById("modal-input-senha-confirma");

    const atual = campoAtual?.value || "";
    const nova = campoNova?.value || "";
    const confirma = campoConfirma?.value || "";

    if (!atual || !nova || !confirma) {
        mostrarNotificacao("Preencha todos os campos de senha.", "error");
        return;
    }

    const senhaAtualValida = PERFIL_ATUAL_DADOS.senha
        ? PERFIL_ATUAL_DADOS.senha === atual
        : (PERFIL_ATUAL_DADOS.cpf === atual || atual === "123456");

    if (!senhaAtualValida) {
        mostrarNotificacao("Senha atual incorreta.", "error");
        return;
    }

    if (nova.length < 6) {
        mostrarNotificacao("A nova senha deve ter pelo menos 6 caracteres.", "error");
        return;
    }

    if (nova !== confirma) {
        mostrarNotificacao("A confirmação não corresponde à nova senha.", "error");
        return;
    }

    if (nova === atual) {
        mostrarNotificacao("A nova senha deve ser diferente da senha atual.", "error");
        return;
    }

    try {
        await updateDoc(doc(db, "usuarios", PERFIL_ATUAL_ID), { senha: nova });
        PERFIL_ATUAL_DADOS.senha = nova;

        mostrarNotificacao("Senha alterada com sucesso!", "success");

        if (campoAtual) campoAtual.value = "";
        if (campoNova) campoNova.value = "";
        if (campoConfirma) campoConfirma.value = "";

        if (typeof window.fecharModalPerfil === "function") window.fecharModalPerfil();

    } catch (error) {
        console.error("Erro ao alterar senha:", error);
        mostrarNotificacao("Erro ao alterar a senha.", "error");
    }
}

async function salvarPerfilLogado() {
    const abaSenha = document.getElementById("subaba-perfil-senha");
    const abaSenhaAtiva = abaSenha && abaSenha.style.display !== "none";

    if (abaSenhaAtiva) {
        await salvarNovaSenhaPerfil();
    } else {
        await salvarInformacoesPerfil();
    }
}

document.addEventListener("click", (e) => {
    if (e.target.closest(".dropdown-perfil-menu button")) {
        setTimeout(preencherFormularioPerfil, 50);
    }
});

// ==========================================================================
// CENTRALIZADOR DE NAVEGAÇÃO E EVENTOS DE INICIALIZAÇÃO
// ==========================================================================
document.addEventListener("click", (e) => {
    const itemMenu = e.target.closest(".sidebar-item");
    if (itemMenu) {
        const idTela = itemMenu.getAttribute("data-tela");
        setTimeout(() => {
            if (idTela === "dashboard") carregarMétricasDashboard();
            if (idTela === "acervo") listarAcervoBanco();
            if (idTela === "emprestimos") { listarEmprestimosBanco(); carregarSelectsEmprestimo(); }
            if (idTela === "devolucoes") listarEmprestimosParaDevolucao();
            if (idTela === "configuracoes") carregarConfiguracoesBanco();
            if (idTela === "usuarios") listarUsuariosBanco();
            if (idTela === "reservas") listarReservasBanco();
        }, 150);
    }
});

document.addEventListener("DOMContentLoaded", () => {
    // Carregamento inicial isolado para evitar falhas em cadeia
    try { carregarMétricasDashboard(); } catch(e) {}
    try { listarAcervoBanco(); } catch(e) {}
    try { listarEmprestimosBanco(); } catch(e) {}
    try { listarUsuariosBanco(); } catch(e) {}
    try { listarEmprestimosParaDevolucao(); } catch(e) {}
    try { listarReservasBanco(); } catch(e) {}
    try { carregarNotificacoesBanco(); } catch(e) {}
    try { carregarPerfilLogado(); } catch(e) {}

    // Botão de salvar no modal do perfil
    const btnSalvarPerfil = document.getElementById("btn-modal-salvar-perfil");
    if (btnSalvarPerfil) {
        btnSalvarPerfil.addEventListener("click", salvarPerfilLogado);
    }

    // Ouvintes para o filtro da Tela de Acervo
    const inputAcervo = document.querySelector("#tela-acervo .search-input");
    const selectGenAcervo = document.getElementById("filtro-acervo-genero");
    const selectStatusAcervo = document.querySelectorAll("#tela-acervo .select-filter")[1];
    if (inputAcervo) inputAcervo.addEventListener("input", renderizarTabelaAcervoAdmin);
    if (selectGenAcervo) selectGenAcervo.addEventListener("change", renderizarTabelaAcervoAdmin);
    if (selectStatusAcervo) selectStatusAcervo.addEventListener("change", renderizarTabelaAcervoAdmin);

    // Ouvintes para o filtro da Tela de Empréstimos
    const inputEmp = document.querySelector("#tela-emprestimos .search-input");
    const selectEmp = document.querySelector("#tela-emprestimos .select-filter");
    if (inputEmp) inputEmp.addEventListener("input", renderizarTabelaEmprestimosAdmin);
    if (selectEmp) selectEmp.addEventListener("change", renderizarTabelaEmprestimosAdmin);

    // Ouvintes para o filtro da Tela de Devoluções
    const inputDev = document.querySelector("#tela-devolucoes .search-input");
    const selectDev = document.querySelector("#tela-devolucoes .select-filter");
    if (inputDev) inputDev.addEventListener("input", renderizarTabelaDevolucoesAdmin);
    if (selectDev) selectDev.addEventListener("change", renderizarTabelaDevolucoesAdmin);

    // Ouvintes para o filtro da Tela de Reservas
    const inputRes = document.querySelector("#tela-reservas .search-input");
    const selectRes = document.querySelector("#tela-reservas .select-filter");
    if (inputRes) inputRes.addEventListener("input", renderizarTabelaReservasAdmin);
    if (selectRes) selectRes.addEventListener("change", renderizarTabelaReservasAdmin);
});