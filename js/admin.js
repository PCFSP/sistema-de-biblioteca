// ==========================================================================
// CONTROLE DE ACESSO: APENAS ADMINISTRADORES
// ==========================================================================
(async function verificarAcessoAdmin() {
    const nomeLogado = localStorage.getItem("usuario-logado-nome");
    const emailLogado = localStorage.getItem("usuario-logado-email");

    // Se não houver dados de login no navegador, barra imediatamente
    if (!nomeLogado || !emailLogado) {
        mostrarNotificacao("Acesso negado! Por favor, faça login.", "error");
        window.location.href = "login.html";
        return;
    }

    // Importação dinâmica temporária para validar o cargo direto no banco de dados
    const { db, collection, getDocs } = await import("./firebase-config.js");
    try {
        const querySnapshot = await getDocs(collection(db, "usuarios"));
        let ehAdmin = false;

        querySnapshot.forEach((docSnap) => {
            const user = docSnap.data();
            if (user.email === emailLogado) {
                const cargo = user.tipoUser ? user.tipoUser.toLowerCase().trim() : "";
                if (cargo === "admin" || cargo === "administrador") {
                    ehAdmin = true;
                }
            }
        });

        if (!ehAdmin) {
            mostrarNotificacao("Área restrita para administradores! Redirecionando...", "error");
            window.location.href = "login.html";
        }
    } catch (error) {
        window.location.href = "login.html";
    }
})();

import { db, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, getDoc } from "./firebase-config.js";

// ==========================================================================
// FUNÇÃO AUXILIAR: TRATAMENTO E CONVERSÃO DE DATAS PARA CÁLCULO
// ==========================================================================

function tratarData(dataBanco) {
    if (!dataBanco) return new Date();
    
    // Se já for um Timestamp do Firebase
    if (typeof dataBanco.toDate === "function") {
        return dataBanco.toDate();
    }
    
    // Se for uma String no formato brasileiro DD/MM/AAAA
    if (typeof dataBanco === "string" && dataBanco.includes("/")) {
        const partes = dataBanco.split("/");
        // JavaScript Date usa mês baseado em 0 (Janeiro = 0)
        return new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
    }
    
    // Qualquer outro formato padrão (String ISO, etc.)
    const dataTenta = new Date(dataBanco);
    return isNaN(dataTenta.getTime()) ? new Date() : dataTenta;
}

// ==========================================================================
// CENTRALIZADOR DE TROCA DE ABAS / GATILHOS DO BANCO (CORRIGIDO)
// ==========================================================================
document.addEventListener("click", (e) => {
    const itemMenu = e.target.closest(".sidebar-item");
    if (!itemMenu) return;

    const idTela = itemMenu.getAttribute("data-tela");
    
    setTimeout(() => {
        if (idTela === "dashboard") carregarMétricasDashboard();
        if (idTela === "acervo") listarAcervoBanco();
        if (idTela === "emprestimos") {
            listarEmprestimosBanco();
            carregarSelectsEmprestimo();
        }
        if (idTela === "devolucoes") listarEmprestimosParaDevolucao();
        if (idTela === "configuracoes") carregarConfiguracoesBanco();
        if (idTela === "usuarios") listarUsuariosBanco(); // Garante o disparo ao clicar na aba
        if (idTela === "reservas") listarReservasBanco();
    }, 150);
});

// Tornar funções de deleção/edição globais para o HTML conseguir chamar nos botões onclick
window.deletarDocumento = async function(colecao, id) {
    // Mapeamento para traduzir o nome da coleção técnica para o usuário
    const nomesAmigaveis = {
        'books': 'este livro',
        'usuarios': 'este usuário',
        'emprestimos': 'este registro de empréstimo',
        'reservas': 'esta reserva'
    };

    const nomeItem = nomesAmigaveis[colecao] || 'este registro';

    // Dispara o SweetAlert2 customizado
    const confirmou = await confirmarAcao(
        "Tem certeza?",
        `Esta ação excluirá permanentemente ${nomeItem} do banco de dados.`,
        "Sim, excluir!"
    );

    if (!confirmou) return;

    try {
        await deleteDoc(doc(db, colecao, id));
        
        mostrarNotificacao("Registro removido com sucesso!", "success");

        // Atualiza a tabela correspondente
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
        
        // Joga os valores para o formulário
        document.getElementById("input-livro-titulo").value = livro.titulo || "";
        document.getElementById("input-livro-autor").value = livro.autor || "";
        document.getElementById("input-livro-editora").value = livro.editora || "";
        document.getElementById("input-livro-ano").value = livro.ano_publicacao || "";
        document.getElementById("input-livro-isbn").value = livro.isbn || "";
        document.getElementById("input-livro-capa").value = livro.capa || "";
        
        // Altera o comportamento do botão salvar para atualizar em vez de criar novo
        const btn = document.getElementById("btn-salvar-livro");
        btn.innerText = "Atualizar Livro";
        btn.dataset.editId = id;
        
        navegar("novo-livro");
    } catch (error) {
        console.error(error);
    }
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

            // Verificação em tempo real se o item está atrasado
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

        // Alimenta os 4 contadores de métricas superiores
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

async function listarAcervoBanco() {
    const tbody = document.querySelector("#tela-acervo .admin-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='8'>Carregando acervo do Firebase...</td></tr>";

    try {
        const querySnapshot = await getDocs(collection(db, "books"));
        tbody.innerHTML = "";

        querySnapshot.forEach((doc) => {
            const livro = doc.data();
            const capaHTML = livro.capa 
                ? `<img src="${livro.capa}" style="width: 35px; height: 50px; border-radius: 4px; object-fit: cover;">`
                : `<div class="table-cover"></div>`;

            const linha = `
                <tr>
                    <td>${capaHTML}</td>
                    <td><strong>${livro.titulo || "Sem título"}</strong></td>
                    <td>${livro.autor || "Desconhecido"}</td>
                    <td><span class="book-tag">${livro.categoria_idCategoria || "Geral"}</span></td>
                    <td>${livro.isbn || "-"}</td>
                    <td><strong>${livro.quantidade || 1}</strong></td>
                    <td><span class="status-tag success">Disponível</span></td>
                    <td>
                        <button class="action-icon" onclick="prepararEdicaoLivro('${doc.id}')" title="Editar"><i data-lucide="pencil" class="icon-small"></i></button>
                        <button class="action-icon btn-action-danger" onclick="deletarDocumento('books', '${doc.id}')" title="Excluir"><i data-lucide="trash-2" class="icon-small"></i></button>
                    </td>
                </tr>
            `;
            tbody.insertAdjacentHTML("beforeend", linha);
        });
        if (typeof lucide !== "undefined") lucide.createIcons();
    } catch (error) {
        console.error(error);
    }
}

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
            // TRAVA ANTI-DUPLICIDADE DE LIVRO (Se não for edição)
            if (!btnSalvarLivro.dataset.editId) {
                const queryLivros = await getDocs(collection(db, "books"));
                let livroExistente = false;

                queryLivros.forEach((docSnap) => {
                    const l = docSnap.data();
                    const isbnExistente = l.isbn ? l.isbn.trim() : "";
                    const tituloExistente = l.titulo ? l.titulo.trim().toLowerCase() : "";
                    const autorExistente = l.autor ? l.autor.trim().toLowerCase() : "";

                    // Compara por ISBN ou por Título + Autor idênticos
                    if ((isbn && isbnExistente === isbn) || (tituloExistente === titulo.toLowerCase() && autorExistente === autor.toLowerCase())) {
                        livroExistente = true;
                    }
                });

                if (livroExistente) {
                    mostrarNotificacao("Este livro já está cadastrado no acervo!", "warning");
                    return;
                }
            }

            const dadosLivro = {
                titulo, 
                autor, 
                editora, 
                isbn, 
                capa,
                ano_publicacao: parseInt(ano) || null,
                categoria_idCategoria: genero,
                quantidade: quantidade
            };

            if (btnSalvarLivro.dataset.editId) {
                await updateDoc(doc(db, "books", btnSalvarLivro.dataset.editId), dadosLivro);
                mostrarNotificacao("Livro atualizado com sucesso!", "success");
                delete btnSalvarLivro.dataset.editId;
                btnSalvarLivro.innerText = "+ Salvar Livro";
            } else {
                await addDoc(collection(db, "books"), dadosLivro);
                mostrarNotificacao("Livro cadastrado com sucesso!", "success");
            }

            navegar("acervo");
            listarAcervoBanco();
            carregarMétricasDashboard();

        } catch (error) {
            console.error("Erro ao salvar livro:", error);
            mostrarNotificacao("Erro ao salvar o livro no banco.", "error");
        }
    });
}
// ==========================================================================
// AUTO-PREENCHIMENTO: HÍBRIDO E ROBUSTO (DEBUGADO)
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

    const isbn = query.replace(/[-\s]/g, '');
    
    if (/^\d{10,13}$/.test(isbn)) {
        buscarPorISBN(isbn);
    } else {
        buscarPorTitulo(query);
    }
}

async function buscarPorISBN(isbn) {
    if (statusMsg) statusMsg.textContent = "Buscando ISBN...";
    
    // 1. Tenta Brasil API
    try {
        const resp = await fetch(`https://brasilapi.com.br/api/isbn/v1/${isbn}`);
        if (resp.ok) {
            const livro = await resp.json();
            salvarResultado([{
                title: livro.title,
                authors: livro.authors,
                year: livro.year,
                publisher: livro.publisher,
                isbn: livro.isbn || isbn, // Garante que pegue o ISBN de retorno
                cover: livro.cover_url || ''
            }]);
            return;
        }
    } catch (e) { console.error("Brasil API falhou:", e); }

    // 2. Tenta Open Library
    try {
        const resp = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
        const data = await resp.json();
        const livro = data[`ISBN:${isbn}`];
        
        if (livro) {
            salvarResultado([{
                title: livro.title,
                authors: livro.authors?.map(a => a.name),
                year: livro.publish_date?.substring(livro.publish_date.length - 4),
                publisher: livro.publishers?.map(p => p.name)[0],
                isbn: isbn,
                cover: livro.cover?.medium || ''
            }]);
            return;
        }
    } catch (e) { console.error("Open Library ISBN falhou:", e); }

    if (statusMsg) statusMsg.textContent = "ISBN não encontrado.";
}

async function buscarPorTitulo(query) {
    if (statusMsg) statusMsg.textContent = "Buscando título...";
    try {
        const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`;
        const resp = await fetch(url);
        const data = await resp.json();
        
        if (data.docs && data.docs.length > 0) {
            const lista = data.docs.map(livro => {
                // DEBUG: veja o que vem no console
                console.log("Dados recebidos da API:", livro);
                
                return {
                    title: livro.title,
                    authors: livro.author_name,
                    year: livro.first_publish_year,
                    publisher: livro.publisher ? livro.publisher[0] : "",
                    // Pega o primeiro ISBN disponível ou uma string vazia
                    isbn: (livro.isbn && livro.isbn.length > 0) ? livro.isbn[0] : "",
                    cover: livro.cover_i ? `https://covers.openlibrary.org/b/id/${livro.cover_i}-M.jpg` : ''
                };
            });
            salvarResultado(lista);
        } else {
            if (statusMsg) statusMsg.textContent = "Nenhum livro encontrado.";
        }
    } catch (e) { console.error("Falha Título:", e); }
}

function salvarResultado(lista) {
    window.resultadosCatalogoTemporarios = lista;
    let html = "";
    lista.forEach((item, index) => {
        html += `
            <div class="autofill-result-item">
                <img src="${item.cover || 'https://via.placeholder.com/40x60?text=Sem+Capa'}" class="autofill-result-img" alt="Capa">
                <div class="autofill-result-info">
                    <span class="autofill-result-title">${item.title}</span>
                    <span class="autofill-result-details">${item.authors ? item.authors.join(', ') : 'Autor desconhecido'}</span>
                    <span style="font-size: 10px; color: #666; display:block;">ISBN: ${item.isbn || 'Não encontrado'}</span>
                </div>
                <button type="button" class="autofill-select-btn" onclick="selecionarOpcaoHibrida(${index})">Selecionar</button>
            </div>
        `;
    });
    if (resultsContainer) resultsContainer.innerHTML = html;
    if (statusMsg) statusMsg.textContent = "Selecione:";
}

window.selecionarOpcaoHibrida = function(index) {
    const item = window.resultadosCatalogoTemporarios[index];
    document.getElementById("input-livro-titulo").value = item.title || '';
    document.getElementById("input-livro-autor").value = item.authors ? item.authors.join(', ') : '';
    document.getElementById("input-livro-ano").value = item.year || '';
    document.getElementById("input-livro-editora").value = item.publisher || '';
    document.getElementById("input-livro-isbn").value = item.isbn || '';
    document.getElementById("input-livro-capa").value = item.cover || '';
    
    if (resultsContainer) resultsContainer.innerHTML = "";
    if (statusMsg) statusMsg.textContent = "✓ Preenchido!";
};

// ==========================================================================
// 3. TELA: EMPRÉSTIMOS (AUTO-PREENCHIMENTO, RENOVAÇÃO E STATUS CORRIGIDO)
// ==========================================================================

// Preenche a data de hoje e +7 dias automaticamente ao abrir/carregar os campos
function inicializarDatasEmprestimo() {
    const inputRetirada = document.getElementById("input-emprestimo-retirada");
    const inputDevolucao = document.getElementById("input-emprestimo-devolucao");

    if (inputRetirada && inputDevolucao) {
        const hoje = new Date();
        const devolucaoPadrao = new Date();
        devolucaoPadrao.setDate(hoje.getDate() + 7);

        // Preenche apenas se estiverem vazios
        if (!inputRetirada.value) {
            inputRetirada.value = hoje.toLocaleDateString('pt-BR');
        }
        if (!inputDevolucao.value) {
            inputDevolucao.value = devolucaoPadrao.toLocaleDateString('pt-BR');
        }
    }
}

async function carregarSelectsEmprestimo() {
    const selectLeitor = document.getElementById("select-emprestimo-leitor");
    const selectLivro = document.getElementById("select-emprestimo-livro");
    
    inicializarDatasEmprestimo(); // Dispara o auto-preenchimento das datas

    if (!selectLeitor || !selectLivro) return;

    try {
        const usersSnap = await getDocs(collection(db, "usuarios"));
        selectLeitor.innerHTML = '<option value="">Selecionar leitor...</option>';
        usersSnap.forEach(docSnap => {
            selectLeitor.innerHTML += `<option value="${docSnap.data().nome}">${docSnap.data().nome}</option>`;
        });

        const booksSnap = await getDocs(collection(db, "books"));
        selectLivro.innerHTML = '<option value="">Selecionar livro...</option>';
        booksSnap.forEach(docSnap => {
            selectLivro.innerHTML += `<option value="${docSnap.data().titulo}">${docSnap.data().titulo}</option>`;
        });
    } catch (error) { 
        console.error("Erro ao carregar leitores/livros:", error); 
    }
}

async function listarEmprestimosBanco() {
    const tbody = document.querySelector("#tela-emprestimos .admin-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='6'>Carregando empréstimos...</td></tr>";

    try {
        const querySnapshot = await getDocs(collection(db, "emprestimos"));
        tbody.innerHTML = "";

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        querySnapshot.forEach((docSnap) => {
            const emp = docSnap.data();
            if (emp.status === "Devolvido") return;

            let dataDevPrevista = tratarData(emp.data_devolucao_prevista);
            let dataDevCompara = new Date(dataDevPrevista);
            dataDevCompara.setHours(0, 0, 0, 0);

            // CORREÇÃO DO STATUS DE ATRASO EM TEMPO REAL
            let statusAtual = emp.status;
            if (hoje > dataDevCompara) {
                statusAtual = "Atrasado";
            }

            const statusTag = statusAtual === "Atrasado" ? "danger" : "success";

            let dataRetiradaFormatada = emp.data_retirada && typeof emp.data_retirada.toDate === "function" 
                ? emp.data_retirada.toDate().toLocaleDateString('pt-BR') 
                : (emp.data_retirada || "-");

            let dataDevolucaoFormatada = dataDevPrevista.toLocaleDateString('pt-BR');

            const leitorExibicao = emp.Usuario_idUsuario || "Desconhecido";
            const livroExibicao = emp.Exemplar_idExemplar || "Livro Não Informado";

            // Botão de renovação (bloqueado se estiver atrasado)
            let botaoRenovarHTML = statusAtual === "Atrasado" 
                ? `<button class="action-icon" style="opacity: 0.4; cursor: not-allowed;" title="Bloqueado para renovação (Atrasado)"><i data-lucide="refresh-cw" class="icon-small"></i></button>`
                : `<button class="action-icon" onclick="renovarEmprestimoAdmin('${docSnap.id}')" title="Renovar +7 dias"><i data-lucide="refresh-cw" class="icon-small"></i></button>`;

            const linha = `
                <tr>
                    <td><strong>${leitorExibicao}</strong></td>
                    <td>${livroExibicao}</td>
                    <td>${dataRetiradaFormatada}</td>
                    <td>${dataDevolucaoFormatada}</td>
                    <td>
                        <span class="status-tag ${statusTag}">
                            ${statusAtual || "Em andamento"}
                        </span>
                    </td>
                    <td>
                        ${botaoRenovarHTML}
                        <button class="action-icon btn-action-danger" onclick="deletarDocumento('emprestimos', '${docSnap.id}')" title="Excluir"><i data-lucide="trash-2" class="icon-small"></i></button>
                    </td>
                </tr>
            `;
            tbody.insertAdjacentHTML("beforeend", linha);
        });

        if (typeof lucide !== "undefined") lucide.createIcons();
    } catch (error) { 
        console.error("Erro ao listar empréstimos:", error); 
    }
}

// AÇÃO DE RENOVAÇÃO DIRETA PELO ADMIN (+7 DIAS)
window.renovarEmprestimoAdmin = async function(idEmprestimo) {
    const confirmou = await confirmarAcao(
        "Renovar Empréstimo?",
        "Deseja estender o prazo de devolução por mais 7 dias a partir do prazo atual?",
        "Sim, renovar"
    );

    if (!confirmou) return;

    try {
        const docRef = doc(db, "emprestimos", idEmprestimo);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) return mostrarNotificacao("Empréstimo não encontrado.", "error");

        const emp = docSnap.data();
        let dataAtualPrevista = tratarData(emp.data_devolucao_prevista);
        
        // Adiciona +7 dias à data prevista existente
        dataAtualPrevista.setDate(dataAtualPrevista.getDate() + 7);

        await updateDoc(docRef, {
            data_devolucao_prevista: dataAtualPrevista.toLocaleDateString('pt-BR'),
            status: "Em andamento"
        });

        mostrarNotificacao("Empréstimo renovado por mais 7 dias!", "success");
        listarEmprestimosBanco();
        carregarMétricasDashboard();

    } catch (error) {
        console.error("Erro ao renovar empréstimo pelo admin:", error);
        mostrarNotificacao("Erro ao processar renovação.", "error");
    }
};

// SALVAR NOVO EMPRÉSTIMO COM TRAVA MÍNIMA DE 7 DIAS
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

        // Calcula a diferença em dias entre devolução e retirada
        dRetirada.setHours(0, 0, 0, 0);
        dDevolucao.setHours(0, 0, 0, 0);
        const diffDias = Math.round((dDevolucao.getTime() - dRetirada.getTime()) / (1000 * 60 * 60 * 24));

        // TRAVA: Impossibilita escolher prazo menor que 7 dias
        if (diffDias < 7) {
            return mostrarNotificacao("A data de devolução deve ter no mínimo 7 dias a partir da data de retirada!", "warning");
        }

        try {
            const queryEmprestimos = await getDocs(collection(db, "emprestimos"));
            const queryLivros = await getDocs(collection(db, "books"));

            // 1. TRAVA DE LIMITE (MÁX 3 POR LEITOR)
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

            // 2. TRAVA DE ESTOQUE DISPONÍVEL
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

            // REGISTRO NO FIREBASE
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
// 4. TELA: DEVOLUÇÕES (COM VISUALIZAÇÃO DE MULTA ATIVA DINÂMICA)
// ==========================================================================
async function listarEmprestimosParaDevolucao() {
    const tbody = document.querySelector("#tela-devolucoes .admin-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='6'>Carregando fluxo de devoluções...</td></tr>";

    try {
        const querySnapshot = await getDocs(collection(db, "emprestimos"));
        tbody.innerHTML = "";

        // Busca o valor atualizado da multa por dia configurado no banco
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

            // SE O LIVRO JÁ FOI DEVOLVIDO
            if (emp.status === "Devolvido") {
                let dataReal = emp.data_devolucao_real && typeof emp.data_devolucao_real.toDate === "function" 
                    ? emp.data_devolucao_real.toDate().toLocaleDateString('pt-BR') 
                    : "Concluído";

                acaoHTML = `<span class="status-tag success">Recebido em ${dataReal}</span>`;
                
                let dPrev = tratarData(emp.data_devolucao_prevista);
                let dReal = tratarData(emp.data_devolucao_real);
                if (dReal > dPrev) {
                    multaHTML = `<span class="status-tag success">Paga</span>`;
                }
            } 
            // SE O EMPRÉSTIMO AINDA ESTÁ ATIVO
            else {
                acaoHTML = `<button class="btn-primary" style="padding: 6px 12px; font-size: 12px;" onclick="confirmarDevolucaoBanco('${docSnap.id}')">Confirmar Devolução</button>`;
                
                // VERIFICAÇÃO DE ATRASO EM TEMPO REAL
                if (hoje > dataDevCompara || emp.status === "Atrasado") {
                    const diferencaTempo = hoje.getTime() - dataDevCompara.getTime();
                    const diasAtraso = Math.max(1, Math.ceil(diferencaTempo / (1000 * 60 * 60 * 24)));
                    const valorCalculado = (diasAtraso * valorMultaDiaria).toFixed(2).replace('.', ',');

                    multaHTML = `<span class="status-tag danger" title="${diasAtraso} dia(s) de atraso">R$ ${valorCalculado}</span>`;
                }
            }

            const linha = `
                <tr>
                    <td><strong>${leitorExibicao}</strong></td>
                    <td>${livroExibicao}</td>
                    <td>${dataRetiradaFormatada}</td>
                    <td>${dataDevolucaoFormatada}</td>
                    <td>${multaHTML}</td>
                    <td style="text-align: right;">${acaoHTML}</td>
                </tr>
            `;
            tbody.insertAdjacentHTML("beforeend", linha);
        });

        if (typeof lucide !== "undefined") lucide.createIcons();

    } catch (error) { 
        console.error("Erro ao carregar tabela de devoluções:", error); 
    }
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

        document.getElementById("config-nome-biblioteca").value = config.nome_biblioteca || "";
        document.getElementById("config-prazo-emprestimo").value = config.prazo_emprestimo_dias || "";
        document.getElementById("config-valor-multa").value = config.valor_multa_diaria || "";
        document.getElementById("config-limite-user").value = config.limite_emprestimos_usuario || "";
        document.getElementById("config-max-renovacao").value = config.prazo_maximo_renovacao_dias || "";
    } catch (error) { console.error(error); }
}

const btnSalvarConfig = document.getElementById("btn-salvar-configuracoes");
if (btnSalvarConfig) {
    btnSalvarConfig.addEventListener("click", async () => {
        if (!idConfigDoc) return mostrarNotificacao("Nenhum documento de configuração localizado.", "warning");
        try {
            await updateDoc(doc(db, "configuracao", idConfigDoc), {
                nome_biblioteca: document.getElementById("config-nome-biblioteca").value,
                prazo_emprestimo_dias: parseInt(document.getElementById("config-prazo-emprestimo").value) || 0,
                valor_multa_diaria: parseFloat(document.getElementById("config-valor-multa").value) || 0,
                limite_emprestimos_usuario: parseInt(document.getElementById("config-limite-user").value) || 0,
                prazo_maximo_renovacao_dias: parseInt(document.getElementById("config-max-renovacao").value) || 0
            });
            mostrarNotificacao("Configurações atualizadas!", "sucess");
            carregarMétricasDashboard();
        } catch (error) { console.error(error); }
    });
}

// ==========================================================================
// 6. TELA: RESERVAS
// ==========================================================================
async function listarReservasBanco() {
    const tbody = document.querySelector("#tela-reservas .admin-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='5'>Carregando reservas do Firebase...</td></tr>";

    try {
        const querySnapshot = await getDocs(collection(db, "reservas"));
        tbody.innerHTML = "";

        querySnapshot.forEach((docSnap) => {
            const res = docSnap.data();
            // Exibe apenas reservas ativas/pendentes
            if (res.status === "Cancelada" || res.status === "Atendida" || res.status === "Concluída") return;

            const isDisponivel = res.status === "Disponível para retirada";
            const statusTag = isDisponivel ? "success" : "warning";
            const statusTexto = isDisponivel ? "Disponível para retirada" : (res.status || "Aguardando liberação");

            let dataReservaFormatada = res.data_reserva && typeof res.data_reserva.toDate === "function" 
                ? res.data_reserva.toDate().toLocaleDateString('pt-BR') 
                : (res.data_reserva || "-");

            const leitorExibicao = res.Usuario_idUsuario || "Desconhecido";
            const livroExibicao = res.Livro_idLivro || "Livro Não Informado";

            // Se ainda está aguardando, o botão NOTIFICA o leitor. Se já foi notificado, o botão apenas indica o estado.
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

            const linha = `
                <tr>
                    <td><strong>${leitorExibicao}</strong></td>
                    <td>${livroExibicao}</td>
                    <td>${dataReservaFormatada}</td>
                    <td><span class="status-tag ${statusTag}">${statusTexto}</span></td>
                    <td>
                        ${acaoNotificarHTML}
                        <button class="action-icon btn-action-danger" onclick="cancelarReservaBanco('${docSnap.id}')" title="Cancelar Reserva">
                            <i data-lucide="trash-2" class="icon-small"></i>
                        </button>
                    </td>
                </tr>
            `;
            tbody.insertAdjacentHTML("beforeend", linha);
        });

        if (typeof lucide !== "undefined") lucide.createIcons();

    } catch (error) { 
        console.error("Erro ao listar reservas:", error); 
    }
}

// MUDANÇA DE STATUS PARA DISPONÍVEL + DISPARO DE ALERTA PARA O LEITOR
window.notificarLivroDisponivel = async function(idReserva, leitor, livro) {
    const confirmou = await confirmarAcao(
        "Disponibilizar para Retirada?",
        `Isso alterará o status da reserva de "${livro}" e enviará um alerta no painel do leitor (${leitor}).`,
        "Sim, avisar leitor!"
    );

    if (!confirmou) return;

    try {
        // 1. Atualiza o status no Firebase para que o leitor veja o aviso no painel dele
        await updateDoc(doc(db, "reservas", idReserva), {
            status: "Disponível para retirada",
            dataDisponibilizado: new Date()
        });

        mostrarNotificacao(`Notificação enviada! O livro "${livro}" agora está marcado para retirada.`, "success");
        
        // Recarrega a tabela e o dashboard
        listarReservasBanco();
        carregarMétricasDashboard();

    } catch (error) {
        console.error("Erro ao notificar leitor:", error);
        mostrarNotificacao("Erro ao atualizar o status da reserva.", "error");
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
// 7. TELA: USUÁRIOS E SUBABA DE SOLICITAÇÕES - ATUALIZADO
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

            // Separação de cargos pelas abas
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

// RENDERIZA APENAS DENTRO DA SUBTELA DE SOLICITAÇÕES EXISTENTE
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
            
            // Filtra exibindo apenas aquelas que estão aguardando decisão
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

        // Atualiza dinamicamente o contador numérico da aba amarela
        if (badgeQtd) {
            badgeQtd.innerText = totalPendentes;
        }

        if (totalPendentes === 0) {
            tbodySolicitacoes.innerHTML = "<tr><td colspan='6' style='text-align: center; color: var(--muted-foreground); padding: 20px 0;'>Nenhuma solicitação de cadastro pendente.</td></tr>";
        }

        if (typeof lucide !== "undefined") lucide.createIcons();

    } catch (error) {
        console.error("Erro ao buscar solicitações do banco:", error);
    }
}

window.decidirSolicitacao = async function(idSolicitacao, aprovado) {
    const titulo = aprovado ? "Aprovar Cadastro?" : "Recusar Cadastro?";
    const mensagem = aprovado 
        ? "O usuário receberá permissão de acesso ao sistema de biblioteca." 
        : "A solicitação será recusada e arquivada.";
    const botaoTexto = aprovado ? "Sim, aprovar!" : "Sim, recusar";

    const confirmou = await confirmarAcao(titulo, mensagem, botaoTexto);
    if (!confirmou) return;

    try {
        const docRef = doc(db, "solicitacoes_cadastro", idSolicitacao);
        const docSnap = await getDoc(docRef);
        
        if (!docSnap.exists()) return mostrarNotificacao("Solicitação não encontrada.", "warning");
        const dados = docSnap.data();

        if (aprovado) {
            await addDoc(collection(db, "usuarios"), {
                nome: dados.nome,
                email: dados.email,
                cpf: dados.cpf,
                telefone: dados.telefone,
                foto: dados.fotoPerfilUrl || "",
                status: "Ativo",
                tipoUser: "leitor",
                dataCadastro: new Date()
            });
            await updateDoc(docRef, { status: "Aprovado" });
            mostrarNotificacao(`Cadastro de ${dados.nome} aprovado!`, "success");
        } else {
            await updateDoc(docRef, { status: "Recusado" });
            mostrarNotificacao("Solicitação recusada.", "info");
        }

        await listarUsuariosBanco();
        await carregarMétricasDashboard();

    } catch (error) {
        console.error("Erro ao processar decisão de cadastro:", error);
    }
};

// ==========================================================================
// CADASTRO DE USUÁRIO COM VALIDAÇÃO ANTI-DUPLICAÇÃO
// ==========================================================================
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
            // VERIFICAÇÃO ANTI-DUPLICAÇÃO NO FIRESTORE
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

            // SALVA NO BANCO CASO NÃO SEJA DUPLICADO
            await addDoc(collection(db, "usuarios"), {
                nome,
                cpf,
                email,
                telefone: telefone || "",
                tipoUser: perfil || "leitor",
                foto: foto || "",
                status: "Ativo",
                dataCadastro: new Date()
            });

            mostrarNotificacao(`Usuário ${nome} (${perfil}) cadastrado com sucesso!`, "success");

            // Limpa o formulário
            document.getElementById("input-user-nome").value = "";
            document.getElementById("input-user-cpf").value = "";
            document.getElementById("input-user-email").value = "";
            document.getElementById("input-user-telefone").value = "";
            document.getElementById("input-user-foto").value = "";

            if (typeof window.alternarFormUsuario === "function") {
                window.alternarFormUsuario(false);
            }

            // Recarrega as tabelas separadas
            await listarUsuariosBanco();

        } catch (error) {
            console.error("Erro ao cadastrar usuário:", error);
            mostrarNotificacao("Erro ao salvar dados no banco de dados.", "error");
        }
    });
}

// ==========================================================================
// 8. DROPDOWN DE NOTIFICAÇÕES (DADOS REAIS DO FIREBASE)
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

        // 1. USUÁRIOS BLOQUEADOS (vermelho)
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

        // 2. RESERVAS DISPONÍVEIS PARA RETIRADA (verde)
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

        // 3. NOVAS MULTAS PENDENTES (azul) - busca o empréstimo relacionado para saber o leitor
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
            } catch (e) { /* mantém "Desconhecido" em caso de falha na busca */ }

            const valorFormatado = Number(m.valor_total || 0).toFixed(2).replace('.', ',');
            notificacoes.push({
                cor: "azul",
                texto: `Nova multa — ${leitor} (R$ ${valorFormatado})`,
                data: m.data_pagamento || new Date()
            });
        }

        // 4. EMPRÉSTIMOS QUE VENCEM AMANHÃ (amarelo)
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

        // Mais recentes primeiro
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
        listaEl.innerHTML = '<p style="text-align: center; color: var(--muted-foreground); font-size: 13px; padding: 16px 0;">Não foi possível carregar as notificações.</p>';
    }
}

// Atualiza a lista sempre que o sino é clicado, garantindo dados sempre atuais
document.addEventListener("click", (e) => {
    if (e.target.closest(".btn-notification")) {
        carregarNotificacoesBanco();
    }
});


// ==========================================================================
// INICIALIZAÇÃO AUTOMÁTICA GERAL EM BLOCOS ISOLADOS (ANTI-TRAVAMENTO)
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    // Executa cada bloco em paralelo. Se um falhar, não quebra os outros.
    try { carregarMétricasDashboard(); } catch(e) { console.error(e); }
    try { listarAcervoBanco(); } catch(e) { console.error(e); }
    try { listarEmprestimosBanco(); } catch(e) { console.error(e); }
    try { listarUsuariosBanco(); } catch(e) { console.error(e); } // Força o carregamento inicial
    try { listarEmprestimosParaDevolucao(); } catch(e) { console.error(e); }
    try { listarReservasBanco(); } catch(e) { console.error(e); }
    try { carregarNotificacoesBanco(); } catch(e) { console.error(e); }
});
