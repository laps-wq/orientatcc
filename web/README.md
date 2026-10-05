# OrientaTCC — aplicação privada

Primeira versão funcional do aplicativo, separada do HTML antigo. Mantém a identidade laranja e o logotipo fornecido. Requer Node.js 24 ou superior; não requer instalação de pacotes npm.

## Testar sem dados reais

No terminal, dentro desta pasta:

```powershell
node server.mjs --preview
```

Abra http://localhost:4180. A prévia usa dois estudantes fictícios e grava decisões em `data-preview/`. Não lê nem altera a planilha real. O servidor de prévia recusa exposição fora de loopback e recusa execução em produção.

```powershell
node --test tests/*.test.mjs
```

## Conectar a conta real

1. Em um projeto autorizado no Google Cloud, habilite a **Google Sheets API**.
2. Configure a tela de consentimento OAuth para esta aplicação. Se o projeto permitir o público interno da instituição, use-o. Caso contrário, configure o público autorizado e inclua a orientadora como usuária de teste enquanto estiver em desenvolvimento. A política do Workspace pode exigir autorização institucional.
3. Crie um cliente OAuth do tipo **Aplicação da Web**, com URI de redirecionamento exata `http://localhost:4180/auth/callback`.
4. Copie `.env.example` para `.env` e preencha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Não envie o segredo pelo chat e não o versione.
5. Gere uma chave: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Guarde o resultado em `TOKEN_ENCRYPTION_KEY` no `.env`.
6. Encerre a prévia e execute `node --env-file=.env server.mjs`.
7. Abra **http://localhost:4180**, entre com `orientador@example.org` e conceda acesso. O aplicativo valida assinatura, emissor, destinatário, expiração, nonce e e-mail confirmado do login. Nenhum outro e-mail é aceito.

O escopo OAuth de Sheets concede acesso mais amplo às planilhas que a conta pode acessar. O servidor limita suas operações à planilha configurada e às colunas especificadas abaixo; isso não equivale a uma permissão Google limitada a um único arquivo. O app não pede acesso ao Drive inteiro, Meet, Tactiq ou GitHub nesta fase.

## O que funciona nesta versão

- Visão dos orientandos, filtros por TCC1/TCC2 e busca.
- Ficha individual em **Ver acompanhamento**, com reuniões mais recentes primeiro, ações, pendências preservadas, aval e links seguros para as fontes. A ficha distingue Tactiq aguardando de reunião não realizada. Os dados vêm da planilha, não de uma conexão automática do site ao plugin Tactiq do chat.
- Fila com confirmação de Aprovar, Pedir ajuste, Descartar e retornar a Pendente.
- Decisões gravadas na planilha: somente observação I e controles L:N de “Para minha aprovação”. A fórmula H, evidências e datas da automação são preservadas.
- Reuniões com botão “Não ocorreu”: grava somente D no registro; ações e observações anteriores são preservadas. A interface mostra Tactiq “Não se aplica” quando marcado. A automação existente continua responsável pela consolidação das pendências na próxima reunião.
- Releitura do registro antes de gravar, recusa de versão desatualizada, gravação agrupada e confirmação por leitura posterior. Nunca há reenvio automático de uma decisão.
- Histórico das operações efetuadas **pelo aplicativo**. Mudanças feitas diretamente na planilha ou por outras ferramentas não aparecem nesse histórico local.
- Sessões de oito horas, cookie HttpOnly/SameSite, proteção CSRF, restrição de origem/Host e armazenamento cifrado de tokens, sessões e conteúdo de auditoria.

## Publicar em um site privado

Esta pasta inclui um Dockerfile. Escolha uma hospedagem de contêiner com **HTTPS e volume persistente** (um único processo/instância nesta versão). Configure no gerenciador de segredos da hospedagem:

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=4180
APP_ORIGIN=https://SEU-DOMINIO
ALLOWED_EMAIL=orientador@example.org
DATA_DIR=/data
TOKEN_ENCRYPTION_KEY=<chave de 64 caracteres hexadecimais>
GOOGLE_CLIENT_ID=<cliente autorizado>
GOOGLE_CLIENT_SECRET=<segredo>
SPREADSHEET_ID=CONFIGURE_SPREADSHEET_ID
```

Adicione `https://SEU-DOMINIO/auth/callback` ao cliente Google. O proxy deve preservar o cabeçalho Host do domínio público. Monte o disco persistente em `/data`, com acesso restrito ao usuário do processo (UID 1000 no contêiner). Faça backup cifrado do banco e da chave, separadamente. Não exponha a porta diretamente sem HTTPS. Não execute `--preview` em hospedagem.

O aplicativo entrega apenas uma tela pública de login e arquivos de interface sem dados acadêmicos; as APIs de dados exigem sessão. Não foi publicado nem conectado por OAuth real durante a implementação. Credenciais, conta de hospedagem e domínio dependem da orientadora. A aceitação das políticas da instituição também precisa ser confirmada antes da publicação.

## Limites e próxima etapa

- O aplicativo lê os dados consolidados na planilha. **Atualizar dados não varre Drive/GitHub nem importa Tactiq.** O agendamento atual ainda não foi migrado para um serviço na nuvem.
- Não envia e-mails, não modifica trabalhos, não executa código de alunos e não toma decisões acadêmicas.
- A área **Transcrições** recebe texto colado do Tactiq, aluno, data e link da fonte. Valida esses campos, cifra o conteúdo e evita duplicatas por aluno/data/texto. Tudo permanece aguardando revisão, sem alterar a planilha, confirmar presença ou extrair/aprovar ações automaticamente. Ainda não importa PDF nem busca o Drive por conta própria. Use somente textos fictícios na prévia.
- As transcrições expiram seis meses após o recebimento; a limpeza ocorre ao consultar essa área. Isso não elimina cópias externas ou backups, nem substitui uma rotina de retenção contínua em produção.
- Sheets não oferece uma transação condicional por versão de célula. A verificação antes da gravação reduz conflitos, mas ainda existe uma janela entre a leitura e a escrita caso alguém edite a mesma linha diretamente na planilha. Evite edição simultânea de uma mesma decisão. Evoluir para banco transacional é a próxima etapa para maior concorrência.
- Tokens e conteúdo da auditoria são cifrados; metadados (ator, horário e ação) ficam no banco privado. A política de exclusão automática em seis meses ainda precisa ser implementada para o banco, backups e documentos externos antes de produção. Não há alegação de conformidade jurídica automática.
- OAuth foi coberto com testes simulados, mas a integração de ponta a ponta com a conta institucional depende de configurar e autorizar o cliente real.

Referência de configuração: https://developers.google.com/identity/protocols/oauth2/web-server
