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

const LEITOR_LOGADO = localStorage.getItem("usuario-logado-nome") || "Fernando Ribeiro";

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
window.renovarEmprestimoLeitor = async function(idEmprestimo) {
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

        let dPrevista = tratarData(emp.data_devolucao_prevista);
        dPrevista.setDate(dPrevista.getDate() + 7);

        await updateDoc(docRef, {
            data_devolucao_prevista: dPrevista.toLocaleDateString('pt-BR'),
            qtdRenovacoes: qtdRenovacoes + 1
        });

        mostrarNotificacao("Livro renovado por mais 7 dias com sucesso!", "success");
        carregarEmprestimosLeitor();
        carregarPainelLeitor();

    } catch (error) {
        console.error("Erro ao renovar livro:", error);
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

        tbodyBuscar.innerHTML = "";

        queryBooks.forEach((docSnap) => {
            const livro = docSnap.data();
            const titulo = livro.titulo || "Sem título";
            const tituloKey = titulo.trim().toLowerCase();

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

            const capaHTML = livro.capa 
                ? `<img src="${livro.capa}" class="table-cover-img">`
                : `<div class="table-cover-placeholder"></div>`;

            const linha = `
                <tr>
                    <td>${capaHTML}</td>
                    <td><strong>${titulo}</strong></td>
                    <td>${livro.autor || "Desconhecido"}</td>
                    <td><span class="book-tag">${livro.categoria_idCategoria || "Geral"}</span></td>
                    <td><span class="status-tag ${statusTag}">${statusTexto}</span></td>
                    <td>${acaoHTML}</td>
                </tr>
            `;
            tbodyBuscar.insertAdjacentHTML("beforeend", linha);
        });

        if (typeof lucide !== "undefined") lucide.createIcons();
    } catch (error) {
        console.error("Erro ao listar catálogo:", error);
    }
}

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

// INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
    carregarPainelLeitor();
    listarCatalogoLivrosLeitor();

    const nomeLogado = localStorage.getItem("usuario-logado-nome");
    if (nomeLogado) {
        const elNome = document.getElementById("perfil-header-nome");
        if (elNome) elNome.innerText = nomeLogado;

        const avatar = document.querySelector(".dashboard-header .header-profile .avatar-circle");
        if (avatar) {
            const partes = nomeLogado.trim().split(" ");
            avatar.innerText = partes.length > 1 ? (partes[0][0] + partes[partes.length - 1][0]).toUpperCase() : partes[0].substring(0, 2).toUpperCase();
            avatar.title = nomeLogado;
        }
    }
});