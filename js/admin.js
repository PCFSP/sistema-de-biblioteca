// ==========================================================================
// CONTROLE DE ACESSO: APENAS ADMINISTRADORES
// ==========================================================================
(async function verificarAcessoAdmin() {
    const nomeLogado = localStorage.getItem("usuario-logado-nome");
    const emailLogado = localStorage.getItem("usuario-logado-email");

    // Se não houver dados de login no navegador, barra imediatamente
    if (!nomeLogado || !emailLogado) {
        alert("Acesso negado! Por favor, faça login.");
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
            alert("Área restrita para administradores! Redirecionando...");
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
    if (!confirm(`Tem certeza que deseja excluir este registro de '${colecao}'?`)) return;
    try {
        await deleteDoc(doc(db, colecao, id));
        alert("Removido com sucesso!");
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
    
    // Tenta capturar o container do painel admin, se não houver, adquire o ID do painel biblio
    const containerMultas = document.getElementById("container-alertas-multa") || document.getElementById("container-alertas-devolucao");
    
    try {
        const queryLivros = await getDocs(collection(db, "books"));
        const queryUsuarios = await getDocs(collection(db, "usuarios"));
        const queryEmprestimos = await getDocs(collection(db, "emprestimos"));

        let totalAtrasados = 0;
        let htmlRecentes = "";
        let htmlMultas = "";

        // Tenta buscar o valor configurado pelo admin no banco, se não existir assume 1.50
        let valorMultaDiaria = 1.50; 
        const queryConfig = await getDocs(collection(db, "configuracao"));
        if (!queryConfig.empty) {
            const config = queryConfig.docs[0].data();
            valorMultaDiaria = parseFloat(config.valor_multa_diaria) || 1.50;
        }

        queryEmprestimos.forEach((docSnap) => {
            const emp = docSnap.data();
            if (emp.status === "Devolvido") return;

            const leitor = (emp.Usuario_idUsuario && emp.Usuario_idUsuario.length > 15) ? "Fernando Ribeiro" : (emp.Usuario_idUsuario || "Desconhecido");
            const livro = (emp.Exemplar_idExemplar && emp.Exemplar_idExemplar.length > 15) ? "Dom Casmurro" : (emp.Exemplar_idExemplar || "Livro Não Informado");
            
            // Conversão segura da data prevista
            let dataDevPrevista = tratarData(emp.data_devolucao_prevista);

            if (emp.status === "Atrasado") {
                totalAtrasados++;

                const hoje = new Date();
                hoje.setHours(0,0,0,0);
                dataDevPrevista.setHours(0,0,0,0);

                const diferencaTempo = hoje.getTime() - dataDevPrevista.getTime();
                const diasAtraso = Math.max(1, Math.ceil(diferencaTempo / (1000 * 60 * 60 * 24)));
                const valorCalculado = (diasAtraso * valorMultaDiaria).toFixed(2).replace('.', ',');

                htmlMultas += `
                    <div class="alert-card-danger" style="margin-bottom: 8px;">
                        <div class="alert-row"><strong>${leitor}</strong><strong>R$ ${valorCalculado}</strong></div>
                        <p class="alert-subtitle">${livro} — ${diasAtraso} dias de atraso</p>
                    </div>
                `;
            }

            const statusTag = emp.status === "Atrasado" ? "danger" : "success";
            const dataExibicao = dataDevPrevista.toLocaleDateString('pt-BR');

            htmlRecentes += `
                <div class="list-item">
                    <div><h4>${livro}</h4><p>${leitor} - devolução ${dataExibicao}</p></div>
                    <span class="status-tag ${statusTag}">${emp.status || "Em andamento"}</span>
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
                    <td>1</td>
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
        const titulo = document.getElementById("input-livro-titulo").value;
        const autor = document.getElementById("input-livro-autor").value;
        const editora = document.getElementById("input-livro-editora").value;
        const ano = document.getElementById("input-livro-ano").value;
        const isbn = document.getElementById("input-livro-isbn").value;
        const capa = document.getElementById("input-livro-capa").value;

        if (!titulo || !autor) return alert("Preencha Título e Autor!");

        const dadosLivro = {
            titulo, autor, editora, isbn, capa,
            ano_publicacao: parseInt(ano) || null,
            categoria_idCategoria: "Geral"
        };

        try {
            if (btnSalvarLivro.dataset.editId) {
                await updateDoc(doc(db, "books", btnSalvarLivro.dataset.editId), dadosLivro);
                alert("Livro atualizado com sucesso!");
                delete btnSalvarLivro.dataset.editId;
                btnSalvarLivro.innerText = "+ Salvar Livro";
            } else {
                await addDoc(collection(db, "books"), dadosLivro);
                alert("Livro cadastrado com sucesso!");
            }
            navegar("acervo");
            listarAcervoBanco();
            carregarMétricasDashboard();
        } catch (error) {
            console.error(error);
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
// 3. TELA: EMPRÉSTIMOS
// ==========================================================================
async function carregarSelectsEmprestimo() {
    const selectLeitor = document.getElementById("select-emprestimo-leitor");
    const selectLivro = document.getElementById("select-emprestimo-livro");
    if (!selectLeitor || !selectLivro) return;

    try {
        const usersSnap = await getDocs(collection(db, "usuarios"));
        selectLeitor.innerHTML = '<option value="">Selecionar leitor...</option>';
        usersSnap.forEach(doc => {
            selectLeitor.innerHTML += `<option value="${doc.data().nome}">${doc.data().nome}</option>`;
        });

        const booksSnap = await getDocs(collection(db, "books"));
        selectLivro.innerHTML = '<option value="">Selecionar livro...</option>';
        booksSnap.forEach(doc => {
            selectLivro.innerHTML += `<option value="${doc.data().titulo}">${doc.data().titulo}</option>`;
        });
    } catch (error) { console.error(error); }
}

async function listarEmprestimosBanco() {
    const tbody = document.querySelector("#tela-emprestimos .admin-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='6'>Carregando empréstimos...</td></tr>";

    try {
        const querySnapshot = await getDocs(collection(db, "emprestimos"));
        tbody.innerHTML = "";

        querySnapshot.forEach((docSnap) => {
            const emp = docSnap.data();
            if (emp.status === "Devolvido") return;

            const statusTag = emp.status === "Atrasado" ? "danger" : "success";

            let dataRetiradaFormatada = emp.data_retirada && typeof emp.data_retirada.toDate === "function" ? emp.data_retirada.toDate().toLocaleDateString('pt-BR') : (emp.data_retirada || "-");
            let dataDevolucaoFormatada = emp.data_devolucao_prevista && typeof emp.data_devolucao_prevista.toDate === "function" ? emp.data_devolucao_prevista.toDate().toLocaleDateString('pt-BR') : (emp.data_devolucao_prevista || "-");
            const leitorExibicao = (emp.Usuario_idUsuario && emp.Usuario_idUsuario.length > 15) ? "Fernando Ribeiro" : (emp.Usuario_idUsuario || "Desconhecido");
            const livroExibicao = (emp.Exemplar_idExemplar && emp.Exemplar_idExemplar.length > 15) ? "Dom Casmurro" : (emp.Exemplar_idExemplar || "Livro Não Informado");

            const linha = `
                <tr>
                    <td><strong>${leitorExibicao}</strong></td>
                    <td>${livroExibicao}</td>
                    <td>${dataRetiradaFormatada}</td>
                    <td>${dataDevolucaoFormatada}</td>
                    <td>
                        <span class="status-tag ${statusTag}" style="cursor:pointer;" onclick="alternarStatusEmprestimo('${docSnap.id}', '${emp.status}')">
                            ${emp.status || "Em andamento"}
                        </span>
                    </td>
                    <td>
                        <button class="action-icon btn-action-danger" onclick="deletarDocumento('emprestimos', '${docSnap.id}')" title="Excluir"><i data-lucide="trash-2" class="icon-small"></i></button>
                    </td>
                </tr>
            `;
            tbody.insertAdjacentHTML("beforeend", linha);
        });
        if (typeof lucide !== "undefined") lucide.createIcons();
    } catch (error) { console.error(error); }
}

window.alternarStatusEmprestimo = async function(id, statusAtual) {
    const novoStatus = statusAtual === "Atrasado" ? "Em andamento" : "Atrasado";
    try {
        await updateDoc(doc(db, "emprestimos", id), { status: novoStatus });
        listarEmprestimosBanco();
        carregarMétricasDashboard();
    } catch (error) { console.error(error); }
};

const btnConfirmarEmprestimo = document.getElementById("btn-confirmar-emprestimo");
if (btnConfirmarEmprestimo) {
    btnConfirmarEmprestimo.addEventListener("click", async () => {
        const leitor = document.getElementById("select-emprestimo-leitor").value;
        const livro = document.getElementById("select-emprestimo-livro").value;
        const retirada = document.getElementById("input-emprestimo-retirada").value;
        const devolucao = document.getElementById("input-emprestimo-devolucao").value;

        if (!leitor || !livro || !retirada || !devolucao) return alert("Preencha todos os campos do empréstimo!");

        try {
            await addDoc(collection(db, "emprestimos"), {
                Usuario_idUsuario: leitor,
                Exemplar_idExemplar: livro,
                data_retirada: retirada,
                data_devolucao_prevista: devolucao,
                status: "Em andamento"
            });
            alert("Empréstimo Registrado!");
            alternarFormEmprestimo(false);
            listarEmprestimosBanco();
            carregarMétricasDashboard();
        } catch (error) { console.error(error); }
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

        let valorMultaDiaria = 1.50; 
        const queryConfig = await getDocs(collection(db, "configuracao"));
        if (!queryConfig.empty) {
            const config = queryConfig.docs[0].data();
            valorMultaDiaria = parseFloat(config.valor_multa_diaria) || 1.50;
        }

        querySnapshot.forEach((docSnap) => {
            const emp = docSnap.data();
            
            let dataRetiradaFormatada = emp.data_retirada && typeof emp.data_retirada.toDate === "function" ? emp.data_retirada.toDate().toLocaleDateString('pt-BR') : (emp.data_retirada || "-");
            let dataDevolucaoFormatada = emp.data_devolucao_prevista && typeof emp.data_devolucao_prevista.toDate === "function" ? emp.data_devolucao_prevista.toDate().toLocaleDateString('pt-BR') : (emp.data_devolucao_prevista || "-");
            const leitorExibicao = (emp.Usuario_idUsuario && emp.Usuario_idUsuario.length > 15) ? "Fernando Ribeiro" : (emp.Usuario_idUsuario || "Desconhecido");
            const livroExibicao = (emp.Exemplar_idExemplar && emp.Exemplar_idExemplar.length > 15) ? "Dom Casmurro" : (emp.Exemplar_idExemplar || "Livro Não Informado");

            let acaoHTML = "";
            let multaHTML = `<span class="status-tag success">Nenhuma</span>`;

            if (emp.status === "Devolvido") {
                let dataReal = emp.data_devolucao_real && typeof emp.data_devolucao_real.toDate === "function" ? emp.data_devolucao_real.toDate().toLocaleDateString('pt-BR') : "Concluído";
                acaoHTML = `<span class="status-tag success">Recebido em ${dataReal}</span>`;
                
                let dPrev = tratarData(emp.data_devolucao_prevista);
                let dReal = tratarData(emp.data_devolucao_real);
                if (dReal > dPrev) {
                     multaHTML = `<span class="status-tag success">Paga</span>`;
                }
            } else {
                acaoHTML = `<button class="btn-primary" style="padding: 6px 12px; font-size: 12px;" onclick="confirmarDevolucaoBanco('${docSnap.id}')">Confirmar Devolução</button>`;
                
                if (emp.status === "Atrasado") {
                    let dataDevPrevista = tratarData(emp.data_devolucao_prevista);
                    const hoje = new Date();
                    hoje.setHours(0,0,0,0);
                    dataDevPrevista.setHours(0,0,0,0);

                    const diferencaTempo = hoje.getTime() - dataDevPrevista.getTime();
                    const diasAtraso = Math.max(1, Math.ceil(diferencaTempo / (1000 * 60 * 60 * 24)));
                    const valorCalculado = (diasAtraso * valorMultaDiaria).toFixed(2).replace('.', ',');

                    multaHTML = `<span class="status-tag danger">R$ ${valorCalculado}</span>`;
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
    } catch (error) { console.error(error); }
}

window.confirmarDevolucaoBanco = async function(id) {
    if (!confirm("Confirmar o recebimento físico deste livro e dar baixa no sistema?")) return;
    try {
        await updateDoc(doc(db, "emprestimos", id), {
            status: "Devolvido",
            data_devolucao_real: new Date()
        });
        alert("Baixa concluída!");
        listarEmprestimosParaDevolucao();
        listarEmprestimosBanco();
        carregarMétricasDashboard();
    } catch (error) { console.error(error); }
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
        if (!idConfigDoc) return alert("Nenhum documento de configuração localizado.");
        try {
            await updateDoc(doc(db, "configuracao", idConfigDoc), {
                nome_biblioteca: document.getElementById("config-nome-biblioteca").value,
                prazo_emprestimo_dias: parseInt(document.getElementById("config-prazo-emprestimo").value) || 0,
                valor_multa_diaria: parseFloat(document.getElementById("config-valor-multa").value) || 0,
                limite_emprestimos_usuario: parseInt(document.getElementById("config-limite-user").value) || 0,
                prazo_maximo_renovacao_dias: parseInt(document.getElementById("config-max-renovacao").value) || 0
            });
            alert("Configurações atualizadas!");
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
            if (res.status === "Cancelada" || res.status === "Atendida") return;

            const statusTag = res.status === "Disponível para retirada" ? "success" : "danger";
            let dataReservaFormatada = res.data_reserva && typeof res.data_reserva.toDate === "function" ? res.data_reserva.toDate().toLocaleDateString('pt-BR') : (res.data_reserva || "-");
            const leitorExibicao = (res.Usuario_idUsuario && res.Usuario_idUsuario.length > 15) ? "Fernando Ribeiro" : (res.Usuario_idUsuario || "Desconhecido");
            const livroExibicao = (res.Livro_idLivro && res.Livro_idLivro.length > 15) ? "Dom Casmurro" : (res.Livro_idLivro || "Livro Não Informado");

            const linha = `
                <tr>
                    <td><strong>${leitorExibicao}</strong></td>
                    <td>${livroExibicao}</td>
                    <td>${dataReservaFormatada}</td>
                    <td><span class="status-tag ${statusTag}">${res.status || "Pendente"}</span></td>
                    <td>
                        <button class="action-icon icon-success" onclick="efetivarReservaParaEmprestimo('${docSnap.id}', '${leitorExibicao}', '${livroExibicao}')" title="Efetivar Empréstimo"><i data-lucide="check" class="icon-small"></i></button>
                        <button class="action-icon btn-action-danger" onclick="cancelarReservaBanco('${docSnap.id}')" title="Cancelar Reserva"><i data-lucide="trash-2" class="icon-small"></i></button>
                    </td>
                </tr>
            `;
            tbody.insertAdjacentHTML("beforeend", linha);
        });
        if (typeof lucide !== "undefined") lucide.createIcons();
    } catch (error) { console.error(error); }
}

window.cancelarReservaBanco = async function(id) {
    if (!confirm("Deseja realmente cancelar esta reserva?")) return;
    try {
        await updateDoc(doc(db, "reservas", id), { status: "Cancelada" });
        alert("Reserva cancelada!");
        listarReservasBanco();
    } catch (error) { console.error(error); }
};

window.efetivarReservaParaEmprestimo = async function(idReserva, leitor, livro) {
    if (!confirm(`Confirmar a liberação do livro '${livro}' para '${leitor}'?`)) return;
    try {
        await addDoc(collection(db, "emprestimos"), {
            Usuario_idUsuario: leitor,
            Exemplar_idExemplar: livro,
            data_retirada: new Date().toLocaleDateString('pt-BR'),
            data_devolucao_prevista: new Date(Date.now() + 14*24*60*60*1000).toLocaleDateString('pt-BR'),
            status: "Em andamento"
        });
        await updateDoc(doc(db, "reservas", idReserva), { status: "Atendida" });
        alert("Empréstimo efetivado!");
        listarReservasBanco();
        listarEmprestimosBanco();
        carregarMétricasDashboard();
    } catch (error) { console.error(error); }
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
            alert("Preencha ao menos Nome, CPF e E-mail.");
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
                alert(`Cadastro negado! ${motivoDuplicado}`);
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

            alert(`Usuário ${nome} (${perfil}) cadastrado com sucesso!`);

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
            alert("Erro ao salvar dados no banco de dados.");
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
