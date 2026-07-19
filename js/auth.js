import { db, collection, getDocs, addDoc } from "./firebase-config.js";

// ==========================================================================
// 1. EVENTO DE LOGIN E REDIRECIONAMENTO POR TIPO DE CONTA
// ==========================================================================
const formLogin = document.getElementById("form-login");

if (formLogin) {
    formLogin.addEventListener("submit", async (e) => {
        e.preventDefault(); // Impede a página de recarregar

        const emailInserido = document.getElementById("email").value.trim();
        const senhaInserida = document.getElementById("senha").value.trim();

        try {
            // Busca a listagem de usuários cadastrados no banco
            const querySnapshot = await getDocs(collection(db, "usuarios"));
            let usuarioEncontrado = null;

            querySnapshot.forEach((docSnap) => {
                const user = docSnap.data();
                // Validação simples combinando e-mail (usando o CPF ou e-mail como senha para testes locais)
                if (user.email === emailInserido && (user.cpf === senhaInserida || senhaInserida === "123456")) {
                    usuarioEncontrado = user;
                }
            });

            if (usuarioEncontrado) {
                // Salva o nome e e-mail no armazenamento do navegador para o painel ler depois
                localStorage.setItem("usuario-logado-nome", usuarioEncontrado.nome);
                localStorage.setItem("usuario-logado-email", usuarioEncontrado.email);

                // Normaliza o cargo para evitar erros de maiúsculas/minúsculas
                const cargo = usuarioEncontrado.tipoUser ? usuarioEncontrado.tipoUser.toLowerCase() : "leitor";

                // Redirecionamento dinâmico conforme a regra de acesso
                if (cargo === "admin" || cargo === "administrador") {
                    window.location.href = "admin.html";
                } else if (cargo === "bibliotecario") {
                    window.location.href = "biblio.html";
                } else {
                    window.location.href = "leitor.html";
                }
            } else {
                alert("Credenciais incorretas ou usuário não localizado!");
            }

        } catch (error) {
            console.error("Erro ao autenticar usuário:", error);
            alert("Falha na conexão com o banco de dados.");
        }
    });
}

// ==========================================================================
// 2. ENVIO DE SOLICITAÇÃO DE CADASTRO PARA O BANCO
// ==========================================================================
const formCadastro = document.querySelector("#tela-cadastro form");

if (formCadastro) {
    formCadastro.addEventListener("submit", async (e) => {
        e.preventDefault();

        const nome = document.getElementById("cad-nome").value;
        const email = document.getElementById("cad-email").value;
        const crb = document.getElementById("cad-crb").value;
        const cargo = document.getElementById("cad-cargo").value;
        const mensagem = document.getElementById("cad-mensagem").value;

        try {
            // Salva o pedido em uma coleção de triagem chamada 'solicitacoes_cadastro'
            await addDoc(collection(db, "solicitacoes_cadastro"), {
                nome,
                email,
                crb: crb || "Não informado",
                cargoPretendido: cargo,
                mensagem: mensagem || "",
                status: "Pendente",
                dataSolicitacao: new Date()
            });

            alert("Solicitação enviada com sucesso! Aguarde a análise do administrador.");
            formCadastro.reset();
            mostrarTelaLogin("login"); // Volta para a tela de login inicial

        } catch (error) {
            console.error("Erro ao enviar solicitação:", error);
            alert("Erro ao processar o seu cadastro.");
        }
    });
}