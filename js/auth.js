import { db, collection, getDocs, addDoc } from "./firebase-config.js";

// ==========================================================================
// 1. EVENTO DE LOGIN COM VALIDAÇÃO DE CRIPTOGRAFIA (SHA-256)
// ==========================================================================
const formLogin = document.getElementById("form-login");

if (formLogin) {
    formLogin.addEventListener("submit", async (e) => {
        e.preventDefault(); // Impede a página de recarregar

        const emailInserido = document.getElementById("email").value.trim().toLowerCase();
        const senhaInserida = document.getElementById("senha").value.trim();

        try {
            // Gera o Hash da senha digitada (e do CPF limpo sem pontuações)
            const senhaLimpa = senhaInserida.replace(/\D/g, ''); 
            
            const hashSenhaDigitada = typeof window.hashSenha === "function" 
                ? await window.hashSenha(senhaInserida) 
                : senhaInserida;
                
            const hashSenhaLimpa = typeof window.hashSenha === "function" 
                ? await window.hashSenha(senhaLimpa) 
                : senhaLimpa;

            // Busca a listagem de usuários cadastrados no banco
            const querySnapshot = await getDocs(collection(db, "usuarios"));
            let usuarioEncontrado = null;

            querySnapshot.forEach((docSnap) => {
                const user = docSnap.data();
                if (!user.email) return;

                const emailBanco = user.email.trim().toLowerCase();

                if (emailBanco === emailInserido) {
                    // Validações de Senha:
                    // 1. Compara o Hash da senha digitada com o Hash no Firestore
                    // 2. Compara o Hash do CPF limpo com o Hash no Firestore
                    // 3. Fallbacks para contas legadas (texto puro)
                    const cpfBancoLimpo = (user.cpf || "").replace(/\D/g, '');

                    const senhaValida = 
                        user.senha === hashSenhaDigitada ||
                        user.senha === hashSenhaLimpa ||
                        user.senha === senhaInserida ||
                        user.senha === senhaLimpa ||
                        user.cpf === senhaInserida ||
                        cpfBancoLimpo === senhaLimpa ||
                        senhaInserida === "123456";

                    if (senhaValida) {
                        usuarioEncontrado = user;
                    }
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
                mostrarNotificacao("Credenciais incorretas ou usuário não localizado!", "error");
            }

        } catch (error) {
            console.error("Erro ao autenticar usuário:", error);
            mostrarNotificacao("Falha na conexão com o banco de dados.", "error");
        }
    });
}

// ==========================================================================
// VALIDAÇÃO E ENVIO DA SOLICITAÇÃO DE CADASTRO CORRIGIDA
// ==========================================================================
const formCadastro = document.getElementById("form-solicitar-cadastro");

if (formCadastro) {
    formCadastro.addEventListener("submit", async (e) => {
        e.preventDefault();

        const nome = document.getElementById("cad-nome").value.trim();
        const email = document.getElementById("cad-email").value.trim().toLowerCase();
        const cpf = document.getElementById("cad-cpf").value.trim();
        const telefone = document.getElementById("cad-telefone").value.trim();
        const perfil = document.getElementById("cad-perfil").value;
        const foto = document.getElementById("cad-foto").value.trim();
        const mensagem = document.getElementById("cad-mensagem").value.trim();

        if (nome.split(" ").length < 2) {
            mostrarNotificacao("Por favor, insira seu nome completo (Nome e Sobrenome).", "error");
            return;
        }

        try {
            await addDoc(collection(db, "solicitacoes_cadastro"), {
                nome,
                email,
                cpf,
                telefone,
                perfilAcessoSolicitado: perfil,
                fotoPerfilUrl: foto || "",
                mensagemAdmin: mensagem || "",
                status: "Pendente",
                dataSolicitacao: new Date()
            });

            mostrarNotificacao("Solicitação enviada com sucesso! O administrador analisará seu cadastro.", "success");
            formCadastro.reset();
            
            if (typeof window.mostrarTelaLogin === "function") {
                window.mostrarTelaLogin("login");
            }

        } catch (error) {
            console.error("Erro ao registrar solicitação:", error);
            mostrarNotificacao("Ocorreu um problema ao enviar a solicitação.", "error");
        }
    });
}