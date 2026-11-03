# Controle de ASOs

App web para controlar exames ocupacionais (ASOs): vencimentos, histórico, agendamentos, importação e exportação em Excel.

- **Página:** hospedada de graça no GitHub Pages.
- **Dados e login:** ficam no Firebase (Google), também no plano gratuito.
- **Segurança:** nenhum dado de colaborador vai para o GitHub. Só entra quem tem login e foi liberado pelo administrador.

Tudo abaixo é feito pelo navegador, sem terminal. Leva uns 20 minutos.

---

## Parte 1 — Firebase (banco de dados e login)

### 1. Criar o projeto
1. Acesse <https://console.firebase.google.com> com uma conta Google (de preferência da empresa).
2. Clique em **Criar projeto**, dê o nome `controle-asos` e pode desativar o Google Analytics.

### 2. Ativar o login por e-mail e senha
1. No menu lateral: **Criação > Authentication > Vamos começar**.
2. Em **Método de login**, escolha **E-mail/senha**, ative a primeira opção e salve.

### 3. Criar o banco de dados
1. Menu lateral: **Criação > Firestore Database > Criar banco de dados**.
2. Local: **southamerica-east1 (São Paulo)**. Os dados ficam no Brasil, o que ajuda com a LGPD.
3. Escolha **Iniciar no modo de produção**.

### 4. Colar as regras de segurança
1. Ainda no Firestore, abra a aba **Regras**.
2. Apague o que estiver lá, cole todo o conteúdo do arquivo `firestore.rules` e clique em **Publicar**.

### 5. Ligar o app ao projeto
1. Clique na engrenagem ⚙ ao lado de "Visão geral do projeto" > **Configurações do projeto**.
2. Em **Seus apps**, clique no ícone **`</>`** (Web), dê um apelido e registre. Não precisa marcar Hosting.
3. Vai aparecer um bloco `const firebaseConfig = { ... }`.
4. No seu computador, clique com o botão direito em `firebase-config.js` > **Abrir com > Bloco de Notas**.
5. Substitua cada `COLE_AQUI` pelo valor correspondente e salve.

### 6. Cadastrar as pessoas da equipe
Para cada pessoa, são dois passos:

1. **Criar o login:** em **Authentication > Usuários > Adicionar usuário**, informe o e-mail e uma senha provisória. Depois, a pessoa pode trocar a senha pelo link "Esqueci minha senha" na tela de login.
2. **Liberar o acesso:** em **Firestore Database > Dados**:
   - Na primeira vez, clique em **Iniciar coleção** e use o ID de coleção `membros`. Nas próximas, clique em **Adicionar documento** dentro de `membros`.
   - **ID do documento:** o e-mail da pessoa, **todo em minúsculas** (ex.: `maria.silva@empresa.com.br`).
   - **Campo:** `papel`, tipo `string`, com o valor `editor` (pode cadastrar e alterar) ou `leitura` (só consulta).

> Crie o login (passo 1) **antes** de liberar o e-mail (passo 2).

---

## Parte 2 — GitHub (publicar a página)

### 1. Criar o repositório
1. Crie uma conta em <https://github.com>, se ainda não tiver.
2. Clique em **+ > New repository**. Nome: `controle-asos`. Deixe como **Public**, porque o GitHub Pages gratuito exige repositório público.
   O código fica visível, mas os dados **não**: eles estão no Firebase, protegidos pelo login.
3. Clique em **Create repository**.

### 2. Enviar os arquivos
1. Na página do repositório recém-criado, clique no link **uploading an existing file**.
2. Arraste estes arquivos: `index.html`, `style.css`, `app.js`, `firebase-config.js`, `firestore.rules`, `README.md` e `.gitignore`.
   - **Não** envie a planilha de ASOs.
3. Clique em **Commit changes**.

### 3. Ativar o GitHub Pages
1. No repositório, vá em **Settings > Pages**.
2. Em **Source**, escolha **Deploy from a branch**. Em **Branch**, escolha `main` e `/ (root)`. Clique em **Save**.
3. Em 1 ou 2 minutos, o link aparece no topo da mesma página:
   `https://SEU-USUARIO.github.io/controle-asos/`

### 4. Autorizar o link no Firebase
Volte ao Firebase e acesse **Authentication > Configurações > Domínios autorizados > Adicionar domínio**.
Adicione `SEU-USUARIO.github.io`. Sem isso, o login não funciona pelo link do GitHub.

---

## Parte 3 — Primeiro uso

1. Abra o link e entre com um usuário **editor**.
2. Clique em **Importar planilha** e escolha a planilha de controle de ASOs. O app encontra sozinho a aba com a coluna "Data Ult. ASO".
3. Confira o resumo e confirme a importação.

Para atualizar os dados depois, é só importar a planilha de novo. A matrícula identifica cada colaborador, então nada é duplicado.

---

## Dia a dia

| Tarefa | Onde |
|---|---|
| Dar acesso a alguém | Parte 1, passo 6 |
| Tirar o acesso de alguém | Apague o usuário em **Authentication > Usuários** e o documento dele em `membros` |
| Trocar alguém de leitura para editor | No documento da pessoa em `membros`, mude `papel` |
| Atualizar o app (versão nova do código) | No GitHub, **Add file > Upload files**, envie o arquivo novo e faça o commit |

## Limites do plano gratuito do Firebase

O plano gratuito permite cerca de **50 mil leituras e 20 mil gravações por dia**. Cada vez que alguém abre o app, ele lê a lista de colaboradores (umas 650 leituras). O app guarda uma cópia no navegador para economizar nas próximas aberturas. Para uma equipe de DP, isso costuma sobrar com folga.

Se um dia passar do limite, o app avisa e volta a funcionar no dia seguinte. Outra opção é ativar o plano pago, que só cobra o que passar do gratuito.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | Estrutura da página (login e painel) |
| `style.css` | Visual |
| `app.js` | Funcionamento: cálculo de vencimentos, filtros, importação, exportação, login |
| `firebase-config.js` | Liga o app ao seu projeto Firebase |
| `firestore.rules` | Regras de quem pode ver e alterar os dados (colar no Firebase) |
| `.gitignore` | Impede que planilhas sejam enviadas ao GitHub por engano |
