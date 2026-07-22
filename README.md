# 📚 Sistema de Gestão de Biblioteca Municipal

Um sistema completo para gerenciamento de acervo, controle de empréstimos, fluxo de devoluções com cálculo automático de multas, triagem de cadastros e área exclusiva para leitores realizarem consultas e solicitações. O projeto utiliza **Firebase Firestore** como banco de dados e foi desenvolvido de forma modular.

---

## 👥 Equipe de Desenvolvimento

Este projeto foi desenvolvido de forma colaborativa por:

* **Heitor** — [@heitor-polvere](https://github.com/heitor-polvere)
  * Responsável por: Estruturação das interfaces do Administrador e do Bibliotecário, e regras de negócio para cálculo de multas.
* **Igor** — [@IgorSamuel48](https://github.com/IgorSamuel48)
  * Responsável por: Arquitetura de banco de dados (Firebase), validações de segurança/rotas, sistema de triagem de cadastros e regra anti-duplicação.
* **João Eduardo** — [@nowhere02](https://github.com/nowhere02)
  * Responsável por: Desenvolvimento da página inicial pública, área de busca de acervo do leitor e estilização geral responsiva (CSS) e APi´s.

---

## 🚀 Tecnologias Utilizadas

* **HTML5 & CSS3** (Variáveis CSS modernas, layouts responsivos e formulários em grid)
* **JavaScript (ES6+)** (Arquitetura orientada a módulos nativos com validações de entrada)
* **Firebase Firestore** (Banco de dados NoSQL assíncrono em tempo real)
* **Lucide Icons** (Biblioteca de ícones vetoriais)

---

## ⚙️ Principais Funcionalidades

* **Consulta Pública de Acervo:** Pesquisa dinamicamente livros cadastrados diretamente da landing page sem necessidade de login.
* **Solicitação de Cadastro:** Fluxo para novos leitores e renovação de contas bloqueadas com máscaras dinâmicas (CPF e Telefone) e validações em tempo real.
* **Painel de Triagem (Admin):** Área restrita para o administrador aprovar ou recusar novos cadastros solicitados.
* **Garantia de Não-Duplicidade:** Trava de segurança que impede o cadastro de e-mails ou CPFs repetidos.
* **Gestão de Acervo e Empréstimos:** Controle total sobre devoluções, prazos e métricas no painel administrativo.

---

## 🛠️ Como Executar o Projeto Localmente

Devido ao uso de Módulos JavaScript (`type="module"`) e variáveis de ambiente para segurança das credenciais do banco, o projeto necessita de um ambiente Node.js instalado.

### 1. Clonar o repositório
```bash
git clone https://github.com/PCFSP/sistema-de-biblioteca.git
cd sistema-de-biblioteca
