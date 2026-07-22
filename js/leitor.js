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

import { db, collection, addDoc, getDocs, doc, updateDoc } from "./firebase-config.js";

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
            listaContainer.innerHTML = `<p style="text-align: center; color: var(--muted-foreground); font-size: 13px; padding: 16px 0;">Nenhuma nova notificação no momento.</p>`;
            if (badge) badge.style.display = 'none';
        } else {
            if (badge) {
                badge.style.display = 'inline-block';
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
        listaContainer.innerHTML = `<p style="text-align: center; color: var(--danger-text); font-size: 13px; padding: 16px 0;">Falha ao carregar alertas.</p>`;
    }
}


// ==========================================================================
// CARREGAR DADOS DO PAINEL DO LEITOR (MÉTRICAS, EMPRÉSTIMOS E MULTAS)
// ==========================================================================
async function carregarPainelLeitor() {
    const tbodyEmprestimos = document.querySelector("#tabela-meus-emprestimos tbody");
    if (!tbodyEmprestimos) return;

    try {
        // 1. Carrega as Configurações para obter o valor base da multa
        let valorMultaDiaria = 1.50;
        const queryConfig = await getDocs(collection(db, "configuracao"));
        if (!queryConfig.empty) {
            valorMultaDiaria = parseFloat(queryConfig.docs[0].data().valor_multa_diaria) || 1.50;
        }

        // 2. Busca os Empréstimos filtrando pelo leitor logado
        const queryEmprestimos = await getDocs(collection(db, "emprestimos"));
        tbodyEmprestimos.innerHTML = "";
        
        let qtdEmprestimosAtivos = 0;
        let totalMultasAcumuladas = 0;

        queryEmprestimos.forEach((docSnap) => {
            const emp = docSnap.data();
            
            // Ignora se o empréstimo já foi finalizado
            if (emp.status === "Devolvido") return;

            // Filtra os dados apenas do usuário que está com a sessão aberta
            const leitorNome = emp.Usuario_idUsuario;
            if (leitorNome !== LEITOR_LOGADO) return;

            qtdEmprestimosAtivos++;
            const livro = emp.Exemplar_idExemplar || "Livro Não Informado";
            
            let dRetirada = tratarData(emp.data_retirada);
            let dPrevista = tratarData(emp.data_devolucao_prevista);
            
            let statusTag = "success";
            let statusTexto = "No prazo";
            let acoesHTML = `<button class="btn-secondary" style="padding: 6px 12px; font-size: 12px;" onclick="renovarEmprestimoLeitor('${docSnap.id}')">Renovar</button>`;

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
                acoesHTML = `<span style="font-size: 13px; color: var(--danger-text); font-weight: 500;">Bloqueado para renovação</span>`;
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
            tbodyEmprestimos.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--muted-foreground);">Você não possui empréstimos ativos no momento.</td></tr>`;
        }

        // 3. Busca as Reservas ativas do Leitor logado
        const queryReservas = await getDocs(collection(db, "reservas"));
        let qtdReservasAtivas = 0;
        queryReservas.forEach((docSnap) => {
            const res = docSnap.data();
            const leitorRes = res.Usuario_idUsuario;
            if (leitorRes === LEITOR_LOGADO && res.status !== "Cancelada" && res.status !== "Atendida") {
                qtdReservasAtivas++;
            }
        });

        // 4. Injeta os contadores dinâmicos nas métricas
        document.getElementById("leitor-qtd-emprestimos").innerText = qtdEmprestimosAtivos;
        document.getElementById("leitor-qtd-reservas").innerText = qtdReservasAtivas;
        document.getElementById("leitor-total-multas").innerText = `R$ ${totalMultasAcumuladas.toFixed(2).replace('.', ',')}`;

    } catch (error) {
        console.error("Erro ao carregar o painel do leitor:", error);
    }
}

// FUNÇÃO PARA EFETUAR A RENOVAÇÃO DIRETA PELO LEITOR
window.renovarEmprestimoLeitor = async function(idEmprestimo) {
    const confirmou = await confirmarAcao(
        "Renovar Empréstimo?",
        "Deseja estender o prazo de devolução deste exemplar por mais 7 dias?",
        "Sim, renovar"
    );

    if (!confirmou) return;

    try {
        const queryConfig = await getDocs(collection(db, "configuracao"));
        let diasExtensao = 7;
        if (!queryConfig.empty) {
            diasExtensao = parseInt(queryConfig.docs[0].data().prazo_emprestimo_dias) || 7;
        }

        const novaData = new Date();
        novaData.setDate(novaData.getDate() + diasExtensao);

        await updateDoc(doc(db, "emprestimos", idEmprestimo), {
            data_devolucao_prevista: novaData.toLocaleDateString('pt-BR')
        });

        mostrarNotificacao("Livro renovado com sucesso!", "success");
        carregarPainelLeitor();
    } catch (error) {
        console.error("Erro ao renovar livro:", error);
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
        
        // Mapeia quais livros estão atualmente emprestados (indisponíveis)
        const livrosEmprestados = [];
        queryEmprestimos.forEach(d => {
            const emp = d.data();
            if (emp.status !== "Devolvido" && emp.Exemplar_idExemplar) {
                livrosEmprestados.push(emp.Exemplar_idExemplar.trim().toLowerCase());
            }
        });

        tbodyBuscar.innerHTML = "";

        queryBooks.forEach((docSnap) => {
            const livro = docSnap.data();
            const titulo = livro.titulo || "Sem título";
            
            // Verifica se o título se encontra na lista de livros emprestados
            const estaEmprestado = livrosEmprestados.includes(titulo.trim().toLowerCase());
            
            const statusTag = estaEmprestado ? "danger" : "success";
            const statusTexto = estaEmprestado ? "Indisponível" : "Disponível";
            
            let acaoHTML = "";
            if (estaEmprestado) {
                acaoHTML = `<button class="btn-secondary" style="padding: 6px 12px; font-size: 12px;" onclick="solicitarReservaLeitor('${titulo}')"><i data-lucide="bookmark" class="icon-small" style="display:inline-block; vertical-align:middle; margin-right:4px;"></i>Reservar</button>`;
            } else {
                acaoHTML = `<button class="btn-primary" style="padding: 6px 12px; font-size: 12px;" onclick="solicitarEmprestimoDireto('${titulo}')">Solicitar Empréstimo</button>`;
            }

            const capaHTML = livro.capa 
                ? `<img src="${livro.capa}" style="width: 32px; height: 48px; border-radius: 4px; object-fit: cover;">`
                : `<div class="table-cover" style="background-color: #555; width: 32px; height: 48px; border-radius: 4px;"></div>`;

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

// CRIAÇÃO DE NOVA RESERVA SE O LIVRO ESTIVER INDISPONÍVEL
window.solicitarReservaLeitor = async function(tituloLivro) {
    const confirmou = await confirmarAcao(
        "Reservar Livro?",
        `Deseja entrar na fila de espera para o livro "${tituloLivro}"?`,
        "Sim, reservar"
    );

    if (!confirmou) return;

    try {
        await addDoc(collection(db, "reservas"), {
            Usuario_idUsuario: LEITOR_LOGADO,
            Livro_idLivro: tituloLivro,
            data_reserva: new Date().toLocaleDateString('pt-BR'),
            status: "Aguardando liberação"
        });
        mostrarNotificacao("Reserva registrada! Acompanhe pelo seu painel.", "success");
        carregarPainelLeitor();
        listarCatalogoLivrosLeitor();
    } catch (error) { 
        console.error("Erro ao solicitar reserva:", error); 
    }
};

// SOLICITAÇÃO DIRETA DE EMPRÉSTIMO SE O LIVRO ESTIVER LIVRE
window.solicitarEmprestimoDireto = async function(tituloLivro) {
    const confirmou = await confirmarAcao(
        "Solicitar Empréstimo?",
        `Deseja solicitar a retirada imediata do livro "${tituloLivro}"?`,
        "Sim, solicitar"
    );

    if (!confirmou) return;

    try {
        const queryConfig = await getDocs(collection(db, "configuracao"));
        let diasPrazo = 14;
        if (!queryConfig.empty) {
            diasPrazo = parseInt(queryConfig.docs[0].data().prazo_emprestimo_dias) || 14;
        }

        const dataRetirada = new Date();
        const dataDevolucao = new Date();
        dataDevolucao.setDate(dataRetirada.getDate() + diasPrazo);

        await addDoc(collection(db, "emprestimos"), {
            Usuario_idUsuario: LEITOR_LOGADO,
            Exemplar_idExemplar: tituloLivro,
            data_retirada: dataRetirada.toLocaleDateString('pt-BR'),
            data_devolucao_prevista: dataDevolucao.toLocaleDateString('pt-BR'),
            status: "Em andamento"
        });

        mostrarNotificacao("Empréstimo solicitado! Retire seu exemplar na bancada.", "success");
        carregarPainelLeitor();
        listarCatalogoLivrosLeitor();
    } catch (error) { 
        console.error("Erro ao solicitar empréstimo:", error); 
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

    // Dinamiza o Avatar e Iniciais superiores com o nome de quem logou de verdade
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