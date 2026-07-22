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

import { db, collection, addDoc, getDocs, doc, updateDoc, getDoc } from "./firebase-config.js";

// CAPTURA DINAMICAMENTE O USUÁRIO QUE FEZ LOGIN NO SISTEMA
const LEITOR_LOGADO = localStorage.getItem("usuario-logado-nome") || "Fernando Ribeiro";

// ==========================================================================
// FUNÇÃO AUXILIAR: CONVERSÃO E TRATAMENTO SEGURO DE DATAS
// ==========================================================================
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
// CARREGAR NOTIFICAÇÕES DO LEITOR VIA FIREBASE
// ==========================================================================
async function carregarNotificacoesLeitor() {
    const listaContainer = document.getElementById("lista-notificacoes");
    const badge = document.getElementById("badge-notificacoes");
    if (!listaContainer) return;

    try {
        const queryEmprestimos = await getDocs(collection(db, "emprestimos"));
        const queryReservas = await getDocs(collection(db, "reservas"));
        const queryConfig = await getDocs(collection(db, "configuracao"));
        
        let valorMultaDiaria = 1.50;
        if (!queryConfig.empty) {
            valorMultaDiaria = parseFloat(queryConfig.docs[0].data().valor_multa_diaria) || 1.50;
        }

        let notificacoes = [];
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        // 1. Círculo Verde: Reserva de livros disponíveis para retirada
        queryReservas.forEach((docSnap) => {
            const res = docSnap.data();
            if (res.Usuario_idUsuario === LEITOR_LOGADO) {
                if (res.status === "Disponível para retirada" || res.status === "Disponível") {
                    notificacoes.push({
                        tipo: 'verde',
                        texto: `<strong>Reserva Disponível:</strong> O livro "${res.Livro_idLivro}" já está separado e disponível para retirada na biblioteca!`,
                        tempo: res.data_reserva || 'Recentemente'
                    });
                }
            }
        });

        // 2. Círculos Azul e Amarelo: Empréstimos (Multas aplicadas e Alertas de vencimento)
        queryEmprestimos.forEach((docSnap) => {
            const emp = docSnap.data();
            if (emp.Usuario_idUsuario === LEITOR_LOGADO && emp.status !== "Devolvido") {
                const livro = emp.Exemplar_idExemplar || "Livro";
                const dPrevista = tratarData(emp.data_devolucao_prevista);
                dPrevista.setHours(0, 0, 0, 0);

                const diferencaDias = Math.ceil((dPrevista.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));

                // Círculo Azul: Nova multa aplicada (Empréstimo em atraso)
                if (emp.status === "Atrasado" || diferencaDias < 0) {
                    const diasAtraso = Math.abs(diferencaDias) || 1;
                    const valorMulta = (diasAtraso * valorMultaDiaria).toFixed(2).replace('.', ',');
                    notificacoes.push({
                        tipo: 'azul',
                        texto: `<strong>Nova Multa Aplicada:</strong> O prazo do livro "${livro}" expirou. Multa atual acumulada em R$ ${valorMulta}.`,
                        tempo: 'Atrasado'
                    });
                } 
                // Círculo Amarelo: Alerta de vencimento (Vence hoje ou nos próximos 2 dias)
                else if (diferencaDias >= 0 && diferencaDias <= 2) {
                    const prazoTexto = diferencaDias === 0 ? "vence <strong>hoje</strong>" : `vence em <strong>${diferencaDias} dia(s)</strong>`;
                    notificacoes.push({
                        tipo: 'amarelo',
                        texto: `<strong>Alerta de Vencimento:</strong> O livro "${livro}" ${prazoTexto}. Lembre-se de renovar ou devolver dentro do prazo.`,
                        tempo: emp.data_devolucao_prevista || 'Em breve'
                    });
                }
            }
        });

        // Injeção dos dados no HTML
        listaContainer.innerHTML = "";
        if (notificacoes.length === 0) {
            listaContainer.innerHTML = `<p class="empty-state-text">Nenhuma nova notificação no momento.</p>`;
            if (badge) badge.classList.add("hidden");
        } else {
            if (badge) {
                badge.classList.remove("hidden");
                badge.innerText = notificacoes.length;
            }

            notificacoes.forEach(notif => {
                const classeDot = notif.tipo === 'verde' ? 'dot-verde' : (notif.tipo === 'azul' ? 'dot-azul' : 'dot-amarelo');
                const itemHTML = `
                    <div class="notificacao-item">
                        <div class="notificacao-dot ${classeDot}"></div>
                        <div class="notificacao-conteudo">
                            <p>${notif.texto}</p>
                            <span class="notificacao-time">${notif.tempo}</span>
                        </div>
                    </div>
                `;
                listaContainer.insertAdjacentHTML("beforeend", itemHTML);
            });
        }

    } catch (error) {
        console.error("Erro ao carregar notificações do leitor:", error);
        listaContainer.innerHTML = `<p class="error-state-text">Falha ao carregar alertas.</p>`;
    }
}

// ==========================================================================
// CARREGAR DADOS DO PAINEL DO LEITOR (MÉTRICAS, EMPRÉSTIMOS E MULTAS)
// ==========================================================================
async function carregarPainelLeitor() {
    const tbodyEmprestimos = document.querySelector("#tabela-meus-emprestimos tbody");
    if (!tbodyEmprestimos) return;

    try {
        let valorMultaDiaria = 1.50;
        const queryConfig = await getDocs(collection(db, "configuracao"));
        if (!queryConfig.empty) {
            valorMultaDiaria = parseFloat(queryConfig.docs[0].data().valor_multa_diaria) || 1.50;
        }

        const queryEmprestimos = await getDocs(collection(db, "emprestimos"));
        tbodyEmprestimos.innerHTML = "";
        
        let qtdEmprestimosAtivos = 0;
        let totalMultasAcumuladas = 0;

        queryEmprestimos.forEach((docSnap) => {
            const emp = docSnap.data();
            
            if (emp.status === "Devolvido") return;

            const leitorNome = emp.Usuario_idUsuario;
            if (leitorNome !== LEITOR_LOGADO) return;

            qtdEmprestimosAtivos++;
            const livro = emp.Exemplar_idExemplar || "Livro Não Informado";
            
            let dRetirada = tratarData(emp.data_retirada);
            let dPrevista = tratarData(emp.data_devolucao_prevista);
            
            let statusTag = "success";
            let statusTexto = "No prazo";
            
            const qtdRenovacoes = emp.qtdRenovacoes || 0;
            let acoesHTML = "";

            if (emp.status === "Atrasado") {
                const hoje = new Date();
                hoje.setHours(0,0,0,0);
                dPrevista.setHours(0,0,0,0);

                const diferenca = hoje.getTime() - dPrevista.getTime();
                const diasAtraso = Math.max(1, Math.ceil(diferenca / (1000 * 60 * 60 * 24)));
                const valorCalculado = diasAtraso * valorMultaDiaria;
                totalMultasAcumuladas += valorCalculado;

                statusTag = "danger";
                statusTexto = `Atrasado (R$ ${valorCalculado.toFixed(2).replace('.', ',')})`;
                acoesHTML = `<span class="text-renovacao-bloqueada">Bloqueado para renovação</span>`;
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
                    <td>${dRetirada.toLocaleDateString('pt-BR')}</td>
                    <td>${dPrevista.toLocaleDateString('pt-BR')}</td>
                    <td><span class="status-tag ${statusTag}">${statusTexto}</span></td>
                    <td>${acoesHTML}</td>
                </tr>
            `;
            tbodyEmprestimos.insertAdjacentHTML("beforeend", linha);
        });

        if (qtdEmprestimosAtivos === 0) {
            tbodyEmprestimos.innerHTML = `<tr><td colspan="5" class="empty-table-row">Você não possui empréstimos ativos no momento.</td></tr>`;
        }

        const queryReservas = await getDocs(collection(db, "reservas"));
        let qtdReservasAtivas = 0;
        queryReservas.forEach((docSnap) => {
            const res = docSnap.data();
            const leitorRes = res.Usuario_idUsuario;
            if (leitorRes === LEITOR_LOGADO && res.status !== "Cancelada" && res.status !== "Atendida" && res.status !== "Concluída") {
                qtdReservasAtivas++;
            }
        });

        document.getElementById("leitor-qtd-emprestimos").innerText = qtdEmprestimosAtivos;
        document.getElementById("leitor-qtd-reservas").innerText = qtdReservasAtivas;
        document.getElementById("leitor-total-multas").innerText = `R$ ${totalMultasAcumuladas.toFixed(2).replace('.', ',')}`;

    } catch (error) {
        console.error("Erro ao carregar o painel do leitor:", error);
    }
}

// ==========================================================================
// FUNÇÃO PARA EFETUAR A RENOVAÇÃO DIRETA PELO LEITOR (MÁX: 1)
// ==========================================================================
window.renovarEmprestimoLeitor = async function(idEmprestimo) {
    try {
        const docRef = doc(db, "emprestimos", idEmprestimo);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            return mostrarNotificacao("Empréstimo não encontrado.", "error");
        }

        const emp = docSnap.data();
        const qtdRenovacoes = emp.qtdRenovacoes || 0;

        if (qtdRenovacoes >= 1) {
            return mostrarNotificacao(
                "Limite de renovação online atingido! É necessário levar o livro presencialmente até a biblioteca para renovar.", 
                "warning"
            );
        }

        const confirmou = await confirmarAcao(
            "Renovar Empréstimo?",
            "Deseja estender o prazo de devolução deste exemplar por mais 7 dias? (Limite de 1 renovação online)",
            "Sim, renovar"
        );

        if (!confirmou) return;

        // FIXO EM 7 DIAS (Ignora os 14 dias da configuração global do sistema)
        const diasExtensao = 7;

        let dPrevista = tratarData(emp.data_devolucao_prevista);
        dPrevista.setDate(dPrevista.getDate() + diasExtensao);

        await updateDoc(docRef, {
            data_devolucao_prevista: dPrevista.toLocaleDateString('pt-BR'),
            qtdRenovacoes: qtdRenovacoes + 1
        });

        mostrarNotificacao("Livro renovado com sucesso por mais 7 dias!", "success");
        carregarPainelLeitor();

    } catch (error) {
        console.error("Erro ao renovar livro:", error);
        mostrarNotificacao("Erro ao tentar renovar o livro.", "error");
    }
};

// ==========================================================================
// BUSCAR LIVROS NO ACERVO (E SOLICITAR RESERVAS)
// ==========================================================================
async function listarCatalogoLivrosLeitor() {
    const tbodyBuscar = document.querySelector("#tabela-buscar-livros tbody");
    if (!tbodyBuscar) return;
    tbodyBuscar.innerHTML = "<tr><td colspan='6'>Carregando livros...</td></tr>";

    try {
        const queryBooks = await getDocs(collection(db, "books"));
        const queryEmprestimos = await getDocs(collection(db, "emprestimos"));
        const queryReservas = await getDocs(collection(db, "reservas"));
        
        // Mapeia os estados do LEITOR LOGADO
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
                if (emp.status === "Solicitado") {
                    minhasSolicitacoesPendente.push(tituloLivro);
                } else {
                    meusEmprestimosAtivos.push(tituloLivro);
                }
            }
        });

        // Mapeia reservas ativas do LEITOR LOGADO
        const minhasReservasAtivas = [];
        queryReservas.forEach(d => {
            const res = d.data();
            if (res.status === "Cancelada" || res.status === "Atendida" || res.status === "Concluída") return;

            const tituloLivro = res.Livro_idLivro ? res.Livro_idLivro.trim().toLowerCase() : "";
            const leitor = res.Usuario_idUsuario ? res.Usuario_idUsuario.trim().toLowerCase() : "";

            if (leitor === LEITOR_LOGADO.trim().toLowerCase()) {
                minhasReservasAtivas.push(tituloLivro);
            }
        });

        tbodyBuscar.innerHTML = "";

        queryBooks.forEach((docSnap) => {
            const livro = docSnap.data();
            const titulo = livro.titulo || "Sem título";
            const tituloKey = titulo.trim().toLowerCase();

            // Lógica de verificação de estados
            const possuiEmprestimoAtivo = meusEmprestimosAtivos.includes(tituloKey);
            const possuiSolicitacaoPendente = minhasSolicitacoesPendente.includes(tituloKey);
            const possuiReservaAtiva = minhasReservasAtivas.includes(tituloKey);
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
            } else if (possuiReservaAtiva) {
                // AJUSTE SOLICITADO: Status fica 'Indisponível' em vermelho
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
        console.error("Erro ao listar catálogo para o leitor:", error);
    }
}

// SOLICITAÇÃO DIRETA (CRIA O STATUS "SOLICITADO" PARA O ADMIN APROVAR)
window.solicitarEmprestimoDireto = async function(tituloLivro) {
    const confirmou = await confirmarAcao(
        "Solicitar Empréstimo?",
        `Deseja solicitar a reserva de retirada para "${tituloLivro}"? O livro ficará separado e você deverá retirá-lo na biblioteca.`,
        "Sim, solicitar"
    );

    if (!confirmou) return;

    try {
        await addDoc(collection(db, "emprestimos"), {
            Usuario_idUsuario: LEITOR_LOGADO,
            Exemplar_idExemplar: tituloLivro,
            data_solicitacao: new Date().toLocaleDateString('pt-BR'),
            status: "Solicitado" // Entra na fila para o Bibliotecário/Admin confirmar a entrega física
        });

        mostrarNotificacao("Solicitação enviada! Dirija-se ao balcão da biblioteca para retirar seu livro.", "success");
        carregarPainelLeitor();
        listarCatalogoLivrosLeitor();

    } catch (error) { 
        console.error("Erro ao solicitar empréstimo:", error); 
        mostrarNotificacao("Erro ao enviar solicitação.", "error");
    }
};

// CRIAÇÃO DE NOVA RESERVA SE O LIVRO ESTIVER INDISPONÍVEL
window.solicitarReservaLeitor = async function(tituloLivro) {
    try {
        const queryReservas = await getDocs(collection(db, "reservas"));
        let reservaExistente = false;

        queryReservas.forEach((docSnap) => {
            const res = docSnap.data();
            const leitorRes = res.Usuario_idUsuario ? res.Usuario_idUsuario.trim().toLowerCase() : "";
            const livroRes = res.Livro_idLivro ? res.Livro_idLivro.trim().toLowerCase() : "";

            if (
                leitorRes === LEITOR_LOGADO.trim().toLowerCase() && 
                livroRes === tituloLivro.trim().toLowerCase() && 
                res.status !== "Cancelada" && 
                res.status !== "Atendida" &&
                res.status !== "Concluída"
            ) {
                reservaExistente = true;
            }
        });

        if (reservaExistente) {
            return mostrarNotificacao(
                `Você já possui uma reserva ativa para "${tituloLivro}". Aguarde a liberação do administrador.`, 
                "warning"
            );
        }

        const confirmou = await confirmarAcao(
            "Reservar Livro?",
            `Deseja entrar na fila de espera para o livro "${tituloLivro}"?`,
            "Sim, reservar"
        );

        if (!confirmou) return;

        await addDoc(collection(db, "reservas"), {
            Usuario_idUsuario: LEITOR_LOGADO,
            Livro_idLivro: tituloLivro,
            data_reserva: new Date().toLocaleDateString('pt-BR'),
            status: "Aguardando liberação"
        });

        mostrarNotificacao("Reserva registrada! Acompanhe o status pelo seu painel.", "success");
        carregarPainelLeitor();
        listarCatalogoLivrosLeitor();

    } catch (error) { 
        console.error("Erro ao solicitar reserva:", error); 
        mostrarNotificacao("Erro ao registrar a reserva.", "error");
    }
};
// ==========================================================================
// ESCUTADOR DE EVENTOS PARA ATUALIZAÇÃO AO TROCAR DE ABAS
// ==========================================================================
document.addEventListener("click", (e) => {
    const itemMenu = e.target.closest(".sidebar-menu li");
    if (!itemMenu) return;
    
    setTimeout(() => {
        const abaBuscarVisivel = document.getElementById("aba-buscar").style.display === "block";
        if (abaBuscarVisivel) {
            listarCatalogoLivrosLeitor();
        } else {
            carregarPainelLeitor();
        }
    }, 100);
});

// DISPARO INICIAL
document.addEventListener("DOMContentLoaded", () => {
    carregarPainelLeitor();
    listarCatalogoLivrosLeitor();
    carregarNotificacoesLeitor();

    const nomeLogado = localStorage.getItem("usuario-logado-nome");
    if (nomeLogado) {
        const avatar = document.querySelector(".dashboard-header .header-profile .avatar-circle");
        if (avatar) {
            const partesNome = nomeLogado.trim().split(" ");
            const iniciais = partesNome.length > 1 
                ? (partesNome[0][0] + partesNome[partesNome.length - 1][0]).toUpperCase()
                : partesNome[0].substring(0, 2).toUpperCase();
            avatar.innerText = iniciais;
            avatar.title = nomeLogado;
        }
    }
});