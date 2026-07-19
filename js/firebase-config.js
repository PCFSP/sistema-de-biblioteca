// Importando o SDK do Firebase e do Firestore direto da CDN oficial da Web
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    setDoc, 
    deleteDoc, 
    updateDoc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Configuração do seu aplicativo Web do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB8TC2WIBqHi4hVg3yJn_aApUf35KCvWVU",
  authDomain: "sistema-biblioteca-7a734.firebaseapp.com",
  projectId: "sistema-biblioteca-7a734",
  storageBucket: "sistema-biblioteca-7a734.firebasestorage.app",
  messagingSenderId: "355328532707",
  appId: "1:355328532707:web:6a318a295b31d4cbe7e5d6"
};

// Inicializa o Firebase e o Banco de Dados (Firestore)
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==========================================================================
// 1. FUNÇÃO PARA CADASTRAR LIVRO E EXEMPLARES (TABELAS: Livro / Exemplar)
// ==========================================================================
export async function cadastrarLivro(dadosLivro, quantidadeExemplares) {
  try {
    const livroRef = await addDoc(collection(db, "livros"), {
      titulo: dadosLivro.titulo,
      autor: dadosLivro.autor,
      editora: dadosLivro.editora,
      ano_publicacao: Number(dadosLivro.ano_publicacao),
      isbn: dadosLivro.isbn,
      categoria: dadosLivro.categoria,
      capa: dadosLivro.capa || "",
      data_cadastro: new Date()
    });

    console.log(`Livro salvo com sucesso! ID: ${livroRef.id}`);

    for (let i = 1; i <= quantidadeExemplares; i++) {
      const subcolecaoExemplaresRef = collection(db, "livros", livroRef.id, "exemplares");
      
      await addDoc(subcolecaoExemplaresRef, {
        numero_exemplar: `EX-${String(i).padStart(2, '0')}`,
        status: "Disponível",
        data_cadastro: new Date()
      });
    }

    alert("Livro e Exemplares cadastrados com sucesso!");
    return livroRef.id;
  } catch (error) {
    console.error("Erro ao cadastrar livro:", error);
  }
}

// ==========================================================================
// 2. FUNÇÃO PARA CADASTRAR USUÁRIOS (TABELA: Usuario)
// ==========================================================================
export async function cadastrarUsuario(dadosUsuario) {
  try {
    const docRef = await addDoc(collection(db, "usuarios"), {
      nome: dadosUsuario.nome,
      cpf: dadosUsuario.cpf,
      email: dadosUsuario.email,
      telefone: dadosUsuario.telefone,
      senha: dadosUsuario.senha,
      foto: dadosUsuario.foto || "",
      tipoUser: dadosUsuario.tipoUser || "leitor",
      status: dadosUsuario.status || "Ativo",
      dataCadastro: new Date()
    });
    alert("Usuário cadastrado com sucesso!");
    return docRef.id;
  } catch (error) {
    console.error("Erro ao cadastrar usuário:", error);
  }
}

// ==========================================================================
// 3. FUNÇÃO PARA CRIAR UMA RESERVA (TABELA: Reserva)
// ==========================================================================
export async function criarReserva(idUsuario, idLivro) {
  try {
    const docRef = await addDoc(collection(db, "reservas"), {
      idUsuario: idUsuario,
      idLivro: idLivro,
      data_reserva: new Date(),
      status: "Pendente"
    });
    alert("Reserva registrada com sucesso!");
    return docRef.id;
  } catch (error) {
    console.error("Erro ao criar reserva:", error);
  }
}

// ==========================================================================
// 4. FUNÇÃO PARA CRIAR UM EMPRÉSTIMO (TABELA: Emprestimo)
// ==========================================================================
export async function criarEmprestimo(idUsuario, idLivro, idExemplar, diasPrazo) {
  try {
    const dataRetirada = new Date();
    const dataDevolucaoPrevista = new Date();
    dataDevolucaoPrevista.setDate(dataRetirada.getDate() + diasPrazo);

    const docRef = await addDoc(collection(db, "emprestimos"), {
      idUsuario: idUsuario,
      idLivro: idLivro,
      idExemplar: idExemplar,
      data_retirada: dataRetirada,
      data_devolucao_prevista: dataDevolucaoPrevista,
      data_devolucao_real: null,
      status: "Em andamento"
    });
    alert("Empréstimo realizado com sucesso!");
    return docRef.id;
  } catch (error) {
    console.error("Erro ao criar empréstimo:", error);
  }
}

// ==========================================================================
// 5. FUNÇÃO PARA CRIAR UMA MULTA (TABELA: Multa)
// ==========================================================================
export async function criarMulta(idEmprestimo, valorTotal) {
  try {
    const docRef = await addDoc(collection(db, "multas"), {
      idEmprestimo: idEmprestimo,
      valor_total: Number(valorTotal),
      valor_pago: 0.00,
      data_pagamento: null,
      status: "Pendente"
    });
    console.log("Multa gerada com sucesso!");
    return docRef.id;
  } catch (error) {
    console.error("Erro ao criar multa:", error);
  }
}

// Exporta o banco e as ferramentas completas incluindo deleção, atualização e busca por ID
export { db, collection, addDoc, getDocs, doc, setDoc, deleteDoc, updateDoc, getDoc };