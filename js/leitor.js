// ==========================================================================
// CONTROLE DE ACESSO: APENAS USUÁRIOS AUTENTICADOS
// ==========================================================================
(function verificarAcessoLeitor() {
    const nomeLogado = localStorage.getItem("usuario-logado-nome");
    if (!nomeLogado) {
        mostrarNotificacao("Sessão expirada ou inválida. Acesse sua conta.", "warning");
        window.location.href = "login.html";
    }
})();

import { db, collection, addDoc, getDocs, doc, updateDoc, getDoc, deleteDoc } from "./firebase-config.js";

let LEITOR_LOGADO = localStorage.getItem("usuario-logado-nome") || "Fernando Ribeiro";

// TRATAMENTO SEGURO DE DATAS
function tratarData(dataBanco) {
    if (!dataBanco) return new Date();
    if (typeof dataBanco.toDate === "function") return dataBanco.toDate();
    if (typeof dataBanco === "string" && dataBanco.includes("/")) {
        const partes = dataBanco.split("/");
        return new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
    }
    const tentaData = new Date(dataBanco);
    return isNaN(tentaData.getTime()) ? new Date() : tentaData;
}

// ==========================================================================
// NAVEGAÇÃO ENTRE ABAS DO LEITOR
// ==========================================================================
window.navegarLeitor = function(aba) {
    const abas = ["painel", "buscar", "emprestimos", "reservas"];
    
    abas.forEach(a => {
        const elAba = document.getElementById(`aba-${a}`);
        const elBtn = document.getElementById(`btn-nav-${a}`);
        if (elAba) elAba.style.display = a === aba ? "block" : "none";
        if (elBtn) {
            if (a === aba) elBtn.classList.add("active");
            else elBtn.classList.remove("active");
        }
    });

    const tituloPagina = document.getElementById("titulo-pagina");
    if (tituloPagina) {
        const titulos = {
            painel: "Meu Painel",
            buscar: "Buscar Livros",
            emprestimos: "Meus Empréstimos",
            reservas: "Minhas Reservas"
        };
        tituloPagina.innerText = titulos[aba] || "Painel do Leitor";
    }

    if (aba === "painel") carregarPainelLeitor();
    if (aba === "buscar") listarCatalogoLivrosLeitor();
    if (aba === "emprestimos") carregarEmprestimosLeitor();
    if (aba === "reservas") carregarReservasLeitor();
};

// ==========================================================================
// CARREGAR PAINEL INICIAL (MÉTRICAS E RESUMO)
// ==========================================================================
async function carregarPainelLeitor() {
    try {
        let valorMultaDiaria = 1.50;
        const queryConfig = await getDocs(collection(db, "configuracao"));
        if (!queryConfig.empty) {
            valorMultaDiaria = parseFloat(queryConfig.docs[0].data().valor_multa_diaria) || 1.50;
        }

        const queryEmprestimos = await getDocs(collection(db, "emprestimos"));
        let qtdEmprestimosAtivos = 0;
        let totalMultasAcumuladas = 0;

        queryEmprestimos.forEach((docSnap) => {
            const emp = docSnap.data();
            if (emp.status === "Devolvido") return;
            if (emp.Usuario_idUsuario !== LEITOR_LOGADO) return;

            qtdEmprestimosAtivos++;
            let dPrevista = tratarData(emp.data_devolucao_prevista);

            if (emp.status === "Atrasado") {
                const hoje = new Date();
                hoje.setHours(0,0,0,0);
                dPrevista.setHours(0,0,0,0);
                const diferenca = hoje.getTime() - dPrevista.getTime();
                const diasAtraso = Math.max(1, Math.ceil(diferenca / (1000 * 60 * 60 * 24)));
                totalMultasAcumuladas += (diasAtraso * valorMultaDiaria);
            }
        });

        const queryReservas = await getDocs(collection(db, "reservas"));
        let qtdReservasAtivas = 0;
        queryReservas.forEach((docSnap) => {
            const res = docSnap.data();
            if (res.Usuario_idUsuario === LEITOR_LOGADO && res.status === "Aguardando liberação") {
                qtdReservasAtivas++;
            }
        });

        document.getElementById("leitor-qtd-emprestimos").innerText = qtdEmprestimosAtivos;
        document.getElementById("leitor-qtd-reservas").innerText = qtdReservasAtivas;
        document.getElementById("leitor-total-multas").innerText = `R$ ${totalMultasAcumuladas.toFixed(2).replace('.', ',')}`;

        carregarEmprestimosLeitor("tabela-resumo-emprestimos");

    } catch (error) {
        console.error("Erro ao carregar o painel do leitor:", error);
    }
}

// ==========================================================================
// ABA MEUS EMPRÉSTIMOS
// ==========================================================================
async function carregarEmprestimosLeitor(idTabela = "tabela-meus-emprestimos") {
    const tbody = document.querySelector(`#${idTabela} tbody`);
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='5' class='empty-table-row'>Carregando empréstimos...</td></tr>";

    try {
        const queryEmprestimos = await getDocs(collection(db, "emprestimos"));
        tbody.innerHTML = "";
        let encontrou = false;

        queryEmprestimos.forEach((docSnap) => {
            const emp = docSnap.data();
            if (emp.status === "Devolvido" || emp.Usuario_idUsuario !== LEITOR_LOGADO) return;

            encontrou = true;
            const livro = emp.Exemplar_idExemplar || "Livro Não Informado";
            let dRetirada = tratarData(emp.data_retirada);
            let dPrevista = tratarData(emp.data_devolucao_prevista);
            
            let statusTag = "success";
            let statusTexto = "No prazo";
            const qtdRenovacoes = emp.qtdRenovacoes || 0;
            let acoesHTML = "";

            if (emp.status === "Solicitado") {
                statusTag = "warning";
                statusTexto = "Aguardando Retirada";
                acoesHTML = `<span class="btn-renovar-limite">Retirar no balcão</span>`;
            } else if (emp.status === "Atrasado") {
                statusTag = "danger";
                statusTexto = "Atrasado";
                acoesHTML = `<span class="text-renovacao-bloqueada">Bloqueado p/ renovação</span>`;
            } else {
                if (qtdRenovacoes >= 1) {
                    acoesHTML = `<span class="btn-renovar-limite" title="Limite online atingido">Renovar na biblioteca</span>`;
                } else {
                    acoesHTML = `<button class="btn-secondary btn-table-action" onclick="renovarEmprestimoLeitor('${docSnap.id}')">Renovar</button>`;
                }
            }

            const linha = `
                <tr>
                    <td><strong>${livro}</strong></td>
                    <td>${emp.status === "Solicitado" ? "Pendente" : dRetirada.toLocaleDateString('pt-BR')}</td>
                    <td>${emp.status === "Solicitado" ? "Pendente" : dPrevista.toLocaleDateString('pt-BR')}</td>
                    <td><span class="status-tag ${statusTag}">${statusTexto}</span></td>
                    <td>${acoesHTML}</td>
                </tr>
            `;
            tbody.insertAdjacentHTML("beforeend", linha);
        });

        if (!encontrou) {
            tbody.innerHTML = `<tr><td colspan="5" class="empty-table-row">Você não possui empréstimos ativos no momento.</td></tr>`;
        }

    } catch (error) {
        console.error("Erro ao carregar empréstimos:", error);
    }
}

// RENOVAÇÃO DIRETA (+7 DIAS COM MÁX: 1)
let processandoRenovacaoLeitor = false;

window.renovarEmprestimoLeitor = async function(idEmprestimo) {
    // Bloqueia se já houver uma requisição em andamento
    if (processandoRenovacaoLeitor) return;

    try {
        const docRef = doc(db, "emprestimos", idEmprestimo);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) return mostrarNotificacao("Empréstimo não encontrado.", "error");

        const emp = docSnap.data();
        const qtdRenovacoes = emp.qtdRenovacoes || 0;

        if (qtdRenovacoes >= 1) {
            return mostrarNotificacao("Limite de renovação online atingido! Dirija-se à biblioteca para renovar.", "warning");
        }

        const confirmou = await confirmarAcao("Renovar Empréstimo?", "Deseja estender o prazo por mais 7 dias?", "Sim, renovar");
        if (!confirmou) return;

        processandoRenovacaoLeitor = true; // Ativa a trava

        let dPrevista = tratarData(emp.data_devolucao_prevista);
        dPrevista.setDate(dPrevista.getDate() + 7);

        // Atualiza unicamente o documento existente (sem criar novo)
        await updateDoc(docRef, {
            data_devolucao_prevista: dPrevista.toLocaleDateString('pt-BR'),
            qtdRenovacoes: qtdRenovacoes + 1
        });

        mostrarNotificacao("Livro renovado por mais 7 dias com sucesso!", "success");
        await carregarEmprestimosLeitor();
        await carregarPainelLeitor();

    } catch (error) {
        console.error("Erro ao renovar livro pelo leitor:", error);
        mostrarNotificacao("Erro ao processar a renovação.", "error");
    } finally {
        processandoRenovacaoLeitor = false; // Libera a trava
    }
};

// ==========================================================================
// ABA MINHAS RESERVAS
// ==========================================================================
async function carregarReservasLeitor() {
    const tbody = document.querySelector("#tabela-minhas-reservas tbody");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='4' class='empty-table-row'>Carregando suas reservas...</td></tr>";

    try {
        const queryReservas = await getDocs(collection(db, "reservas"));
        tbody.innerHTML = "";
        let encontrou = false;

        queryReservas.forEach((docSnap) => {
            const res = docSnap.data();
            if (res.Usuario_idUsuario !== LEITOR_LOGADO) return;
            if (res.status === "Cancelada" || res.status === "Atendida" || res.status === "Concluída") return;

            encontrou = true;
            const isDisponivel = res.status === "Disponível para retirada" || res.status === "Disponível";
            const statusTag = isDisponivel ? "success" : "warning";
            const statusTexto = isDisponivel ? "Disponível para retirada" : "Aguardando liberação";

            let acaoHTML = isDisponivel
                ? `<button class="btn-primary btn-table-action" onclick="solicitarEmprestimoDireto('${res.Livro_idLivro}')">Solicitar Empréstimo</button>`
                : `<button class="btn-secondary btn-table-action btn-action-danger" onclick="cancelarReservaLeitor('${docSnap.id}')">Cancelar</button>`;

            const linha = `
                <tr>
                    <td><strong>${res.Livro_idLivro || "Sem título"}</strong></td>
                    <td>${res.data_reserva || "-"}</td>
                    <td><span class="status-tag ${statusTag}">${statusTexto}</span></td>
                    <td>${acaoHTML}</td>
                </tr>
            `;
            tbody.insertAdjacentHTML("beforeend", linha);
        });

        if (!encontrou) {
            tbody.innerHTML = `<tr><td colspan="4" class="empty-table-row">Você não possui reservas pendentes.</td></tr>`;
        }

    } catch (error) {
        console.error("Erro ao carregar reservas do leitor:", error);
    }
}

window.cancelarReservaLeitor = async function(idReserva) {
    const confirmou = await confirmarAcao("Cancelar Reserva?", "Deseja sair da fila de espera deste livro?", "Sim, cancelar");
    if (!confirmou) return;

    try {
        await deleteDoc(doc(db, "reservas", idReserva));
        mostrarNotificacao("Reserva cancelada.", "success");
        carregarReservasLeitor();
        carregarPainelLeitor();
    } catch (error) {
        console.error("Erro ao cancelar reserva:", error);
    }
};

// ==========================================================================
// ABA BUSCAR LIVROS (CATÁLOGO GERAL)
// ==========================================================================
let livrosCatalogoCache = [];

// ==========================================================================
// ABA BUSCAR LIVROS (CARREGAMENTO E FILTRAGEM)
// ==========================================================================
async function listarCatalogoLivrosLeitor() {
    const tbodyBuscar = document.querySelector("#tabela-buscar-livros tbody");
    if (!tbodyBuscar) return;
    tbodyBuscar.innerHTML = "<tr><td colspan='6' class='empty-table-row'>Carregando livros...</td></tr>";

    try {
        const queryBooks = await getDocs(collection(db, "books"));
        const queryEmprestimos = await getDocs(collection(db, "emprestimos"));
        const queryReservas = await getDocs(collection(db, "reservas"));
        
        const meusEmprestimosAtivos = [];
        const minhasSolicitacoesPendente = [];
        const livrosEmprestadosGeral = [];

        queryEmprestimos.forEach(d => {
            const emp = d.data();
            if (emp.status === "Devolvido") return;

            const tituloLivro = emp.Exemplar_idExemplar ? emp.Exemplar_idExemplar.trim().toLowerCase() : "";
            const leitor = emp.Usuario_idUsuario ? emp.Usuario_idUsuario.trim().toLowerCase() : "";

            livrosEmprestadosGeral.push(tituloLivro);

            if (leitor === LEITOR_LOGADO.trim().toLowerCase()) {
                if (emp.status === "Solicitado") minhasSolicitacoesPendente.push(tituloLivro);
                else meusEmprestimosAtivos.push(tituloLivro);
            }
        });

        const minhasReservasAguardando = [];
        const minhasReservasLiberadas = [];

        queryReservas.forEach(d => {
            const res = d.data();
            if (res.status === "Cancelada" || res.status === "Atendida" || res.status === "Concluída") return;

            const tituloLivro = res.Livro_idLivro ? res.Livro_idLivro.trim().toLowerCase() : "";
            const leitor = res.Usuario_idUsuario ? res.Usuario_idUsuario.trim().toLowerCase() : "";

            if (leitor === LEITOR_LOGADO.trim().toLowerCase()) {
                if (res.status === "Disponível para retirada" || res.status === "Disponível") {
                    minhasReservasLiberadas.push(tituloLivro);
                } else {
                    minhasReservasAguardando.push(tituloLivro);
                }
            }
        });

        // Monta o cache local com os estados calculados
        livrosCatalogoCache = [];
        const generosEncontrados = new Set();

        queryBooks.forEach((docSnap) => {
            const livro = docSnap.data();
            const titulo = livro.titulo || "Sem título";
            const tituloKey = titulo.trim().toLowerCase();
            const genero = livro.categoria_idCategoria || "Geral";

            generosEncontrados.add(genero);

            const possuiEmprestimoAtivo = meusEmprestimosAtivos.includes(tituloKey);
            const possuiSolicitacaoPendente = minhasSolicitacoesPendente.includes(tituloKey);
            const possuiReservaAguardando = minhasReservasAguardando.includes(tituloKey);
            const possuiReservaLiberada = minhasReservasLiberadas.includes(tituloKey);
            const estaEmprestadoGeral = livrosEmprestadosGeral.includes(tituloKey);

            let statusTag = "success";
            let statusTexto = "Disponível";
            let acaoHTML = "";

            if (possuiEmprestimoAtivo) {
                statusTag = "info";
                statusTexto = "Em sua posse";
                acaoHTML = `<span class="status-tag success">Empréstimo Ativo</span>`;
            } else if (possuiSolicitacaoPendente) {
                statusTag = "warning";
                statusTexto = "Aguardando Retirada";
                acaoHTML = `<span class="status-tag warning">Aguardando Retirada</span>`;
            } else if (possuiReservaLiberada) {
                statusTag = "success";
                statusTexto = "Pronto p/ Retirada";
                acaoHTML = `<button class="btn-primary btn-table-action" onclick="solicitarEmprestimoDireto('${titulo}')">Solicitar Empréstimo</button>`;
            } else if (possuiReservaAguardando) {
                statusTag = "danger";
                statusTexto = "Indisponível";
                acaoHTML = `<span class="status-tag warning">Reservado</span>`;
            } else if (estaEmprestadoGeral) {
                statusTag = "danger";
                statusTexto = "Indisponível";
                acaoHTML = `<button class="btn-secondary btn-table-action" onclick="solicitarReservaLeitor('${titulo}')"><i data-lucide="bookmark" class="icon-small icon-btn-reserva"></i>Reservar</button>`;
            } else {
                acaoHTML = `<button class="btn-primary btn-table-action" onclick="solicitarEmprestimoDireto('${titulo}')">Solicitar Empréstimo</button>`;
            }

            livrosCatalogoCache.push({
                ...livro,
                titulo,
                genero,
                statusTexto,
                statusTag,
                acaoHTML
            });
        });

        // Preenche o Select de Gêneros Dinamicamente
        preencherSelectGenerosLeitor(Array.from(generosEncontrados));

        // Renderiza a tabela aplicando os filtros atuais
        renderizarTabelaCatalogoLeitor();

    } catch (error) {
        console.error("Erro ao listar catálogo:", error);
    }
}

// Preenche as opções do select de gênero no HTML sem duplicar
function preencherSelectGenerosLeitor(generos) {
    const selectGenero = document.querySelector("#aba-buscar .table-controls select:nth-of-type(1)");
    if (!selectGenero) return;

    const valorAtual = selectGenero.value;
    selectGenero.innerHTML = `<option value="">Todos os Gêneros</option>`;
    generos.sort().forEach(g => {
        selectGenero.innerHTML += `<option value="${g}">${g}</option>`;
    });
    selectGenero.value = valorAtual;
}

// Função de filtragem e renderização
function renderizarTabelaCatalogoLeitor() {
    const tbodyBuscar = document.querySelector("#tabela-buscar-livros tbody");
    if (!tbodyBuscar) return;

    const inputBusca = document.querySelector("#aba-buscar .search-input")?.value.toLowerCase().trim() || "";
    const filtroGenero = document.querySelector("#aba-buscar .select-filter")?.value || "";

    const livrosFiltrados = livrosCatalogoCache.filter(livro => {
        const bateTexto = (livro.titulo || "").toLowerCase().includes(inputBusca) ||
                          (livro.autor || "").toLowerCase().includes(inputBusca) ||
                          (livro.genero || "").toLowerCase().includes(inputBusca);

        const bateGenero = !filtroGenero || livro.genero === filtroGenero;

        return bateTexto && bateGenero;
    });

    tbodyBuscar.innerHTML = "";

    if (livrosFiltrados.length === 0) {
        tbodyBuscar.innerHTML = `<tr><td colspan="6" class="empty-table-row">Nenhum livro encontrado com os filtros aplicados.</td></tr>`;
        return;
    }

    livrosFiltrados.forEach(livro => {
        const capaHTML = livro.capa 
            ? `<img src="${livro.capa}" class="table-cover-img">`
            : `<div class="table-cover-placeholder"></div>`;

        const linha = `
            <tr>
                <td>${capaHTML}</td>
                <td><strong>${livro.titulo}</strong></td>
                <td>${livro.autor || "Desconhecido"}</td>
                <td><span class="book-tag">${livro.genero}</span></td>
                <td><span class="status-tag ${livro.statusTag}">${livro.statusTexto}</span></td>
                <td>${livro.acaoHTML}</td>
            </tr>
        `;
        tbodyBuscar.insertAdjacentHTML("beforeend", linha);
    });

    if (typeof lucide !== "undefined") lucide.createIcons();
}

// Vincular os ouvintes de evento nos controles de filtro
document.addEventListener("DOMContentLoaded", () => {
    // Escutadores para o Leitor
    const inputSearch = document.querySelector("#aba-buscar .search-input");
    const selectGenero = document.querySelector("#aba-buscar .table-controls select:nth-of-type(1)");
    const selectDisp = document.querySelector("#aba-buscar .table-controls select:nth-of-type(2)");

    if (inputSearch) inputSearch.addEventListener("input", renderizarTabelaCatalogoLeitor);
    if (selectGenero) selectGenero.addEventListener("change", renderizarTabelaCatalogoLeitor);
    if (selectDisp) selectDisp.addEventListener("change", renderizarTabelaCatalogoLeitor);
});

// AÇÃO DE RESERVA
window.solicitarReservaLeitor = async function(tituloLivro) {
    try {
        const queryReservas = await getDocs(collection(db, "reservas"));
        let reservaExistente = false;

        queryReservas.forEach((docSnap) => {
            const res = docSnap.data();
            if (
                res.Usuario_idUsuario?.trim().toLowerCase() === LEITOR_LOGADO.trim().toLowerCase() && 
                res.Livro_idLivro?.trim().toLowerCase() === tituloLivro.trim().toLowerCase() && 
                res.status !== "Cancelada" && res.status !== "Atendida"
            ) {
                reservaExistente = true;
            }
        });

        if (reservaExistente) {
            return mostrarNotificacao(`Você já possui uma reserva ativa para "${tituloLivro}".`, "warning");
        }

        const confirmou = await confirmarAcao("Reservar Livro?", `Entrar na fila de espera para "${tituloLivro}"?`, "Sim, reservar");
        if (!confirmou) return;

        await addDoc(collection(db, "reservas"), {
            Usuario_idUsuario: LEITOR_LOGADO,
            Livro_idLivro: tituloLivro,
            data_reserva: new Date().toLocaleDateString('pt-BR'),
            status: "Aguardando liberação"
        });

        mostrarNotificacao("Reserva registrada! Acompanhe pela aba Minhas Reservas.", "success");
        carregarPainelLeitor();
        listarCatalogoLivrosLeitor();

    } catch (error) { 
        console.error("Erro ao solicitar reserva:", error); 
    }
};

// AÇÃO DE SOLICITAR EMPRÉSTIMO DIRETO
window.solicitarEmprestimoDireto = async function(tituloLivro) {
    const confirmou = await confirmarAcao("Solicitar Empréstimo?", `Solicitar a reserva de retirada para "${tituloLivro}"?`, "Sim, solicitar");
    if (!confirmou) return;

    try {
        await addDoc(collection(db, "emprestimos"), {
            Usuario_idUsuario: LEITOR_LOGADO,
            Exemplar_idExemplar: tituloLivro,
            data_solicitacao: new Date().toLocaleDateString('pt-BR'),
            status: "Solicitado"
        });

        mostrarNotificacao("Solicitação enviada! Dirija-se ao balcão da biblioteca para retirar seu exemplar.", "success");
        carregarPainelLeitor();
        listarCatalogoLivrosLeitor();

    } catch (error) { 
        console.error("Erro ao solicitar empréstimo:", error); 
    }
};

// ==========================================================================
// PERFIL DO LEITOR LOGADO (CARREGAR DADOS / SALVAR / ALTERAR SENHA)
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
    document.querySelectorAll(".header-profile .avatar-circle, #modal-perfil-avatar").forEach((el) => {
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

// Busca no Firestore os dados reais do leitor logado (por e-mail) e preenche cabeçalho, dropdown e modal
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

        if (elNomeHeader) elNomeHeader.innerText = encontrado.nome || "Leitor";
        if (elEmailHeader) elEmailHeader.innerText = encontrado.email || "";
        if (elModalNome) elModalNome.innerText = encontrado.nome || "Leitor";

        aplicarIniciaisAvatarPerfil(encontrado.nome);
        preencherFormularioPerfil();

    } catch (error) {
        console.error("Erro ao carregar dados do perfil:", error);
    }
}

// Salva Nome / E-mail / Telefone (aba "Informações").
// Como empréstimos e reservas referenciam o leitor pelo NOME (Usuario_idUsuario),
// ao renomear é preciso atualizar também esses registros para não "perder" o histórico.
async function salvarInformacoesPerfil() {
    if (!PERFIL_ATUAL_ID || !PERFIL_ATUAL_DADOS) {
        mostrarNotificacao("Não foi possível identificar seu usuário. Faça login novamente.", "error");
        return;
    }

    const nomeAntigo = PERFIL_ATUAL_DADOS.nome || "";
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
        // Garante que o e-mail não pertence a outra conta já cadastrada
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

        // Se o nome mudou, propaga para os empréstimos e reservas já registrados no nome antigo
        if (nome !== nomeAntigo) {
            const [queryEmprestimos, queryReservas] = await Promise.all([
                getDocs(collection(db, "emprestimos")),
                getDocs(collection(db, "reservas"))
            ]);

            const atualizacoes = [];

            queryEmprestimos.forEach((docSnap) => {
                if (docSnap.data().Usuario_idUsuario === nomeAntigo) {
                    atualizacoes.push(updateDoc(doc(db, "emprestimos", docSnap.id), { Usuario_idUsuario: nome }));
                }
            });

            queryReservas.forEach((docSnap) => {
                if (docSnap.data().Usuario_idUsuario === nomeAntigo) {
                    atualizacoes.push(updateDoc(doc(db, "reservas", docSnap.id), { Usuario_idUsuario: nome }));
                }
            });

            await Promise.all(atualizacoes);
        }

        PERFIL_ATUAL_DADOS.nome = nome;
        PERFIL_ATUAL_DADOS.email = email;
        PERFIL_ATUAL_DADOS.telefone = telefone;
        LEITOR_LOGADO = nome;

        // Mantém o localStorage sincronizado, já que login.html e o controle de acesso dependem dele
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

        // Recarrega os dados exibidos, já que agora dependem do nome atualizado
        carregarPainelLeitor();

    } catch (error) {
        console.error("Erro ao salvar perfil:", error);
        mostrarNotificacao("Erro ao salvar as alterações do perfil.", "error");
    }
}

// Salva a nova senha (aba "Alterar Senha"), validando a senha atual da mesma forma que o login faz
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

    // A mesma regra de validação usada no login: senha própria se existir, senão CPF ou "123456"
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

// Decide qual aba está ativa no momento do clique em "Salvar" e chama a rotina certa
async function salvarPerfilLogado() {
    const abaSenha = document.getElementById("subaba-perfil-senha");
    const abaSenhaAtiva = abaSenha && abaSenha.style.display !== "none";

    if (abaSenhaAtiva) {
        await salvarNovaSenhaPerfil();
    } else {
        await salvarInformacoesPerfil();
    }
}

// Sempre que o dropdown abrir o modal, repopula os campos com os dados mais recentes
document.addEventListener("click", (e) => {
    if (e.target.closest(".dropdown-perfil-menu button")) {
        setTimeout(preencherFormularioPerfil, 50);
    }
});

// INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
    carregarPainelLeitor();
    listarCatalogoLivrosLeitor();
    carregarPerfilLogado();

    const btnSalvarPerfil = document.getElementById("btn-modal-salvar-perfil");
    if (btnSalvarPerfil) {
        btnSalvarPerfil.addEventListener("click", salvarPerfilLogado);
    }
});