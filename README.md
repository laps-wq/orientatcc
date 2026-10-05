# OrientaTCC

Apoio ao acompanhamento de trabalhos de conclusão de curso: evidências, reuniões, pendências e avaliação revisada pelo docente.

**Estado: piloto local.** Este repositório privado guarda código e documentação, não o histórico acadêmico dos estudantes. A quantidade de orientandos, grupos, agendas e prazos deve seguir o cadastro de cada orientador.

## O que há neste repositório

| Pasta | Conteúdo | Situação |
| --- | --- | --- |
| `local/` | Demonstração HTML com a identidade visual e o módulo de avaliação simplificada | Abre no navegador, sem configuração de conta |
| `web/` | Protótipo Node.js de aplicação privada, com fila de aprovação, reuniões e fichas individuais | Prévia fictícia disponível; conexão real e hospedagem não validadas |
| `docs/` | Prompt de reconstrução e requisitos do projeto | Referência do produto; não significa que tudo esteja implementado na demonstração |

O painel operacional original contém dados pessoais e acadêmicos misturados ao HTML e **permanece somente no ambiente local da orientadora**. A demonstração não é uma cópia completa de todas as suas telas ou de seu histórico. O módulo de avaliação e o código do protótipo web foram preservados; os exemplos não representam estudantes reais.

## Experimentar a avaliação simplificada

Abra `local/index.html` no navegador. Escolha o estudante fictício, revise as duas notas (entrega e processo), edite o feedback e salve um rascunho ou confirme a avaliação. Histórico e rubrica opcional ficam recolhidos.

- Nenhuma nota é inferida automaticamente de quantidade de arquivos ou commits.
- A rubrica opcional calcula uma sugestão somente após preenchimento e revisão das evidências.
- A decisão acadêmica é sempre humana; nada é enviado aos estudantes ou à planilha.
- Dados ficam no `localStorage` do navegador. Trocar de navegador, origem ou limpar dados pode torná-los indisponíveis.
- É possível exportar o registro da avaliação nas opções. Guarde exportações reais fora do Git.

## Experimentar a aplicação web

Requer **Node.js 24 ou superior**. Não há dependências npm para instalar.

```sh
cd web
node server.mjs --preview
```

Abra `http://localhost:4180`. A prévia usa exemplos fictícios, só aceita execução local e grava em `web/data-preview/` (ignorado pelo Git). Ela não acessa a planilha real.

```sh
node --test tests/*.test.mjs
```

Consulte [`web/README.md`](web/README.md) para a configuração do protótipo. Use seu e-mail e identificador de planilha no `.env`; os valores de exemplo não são credenciais válidas. A integração real depende de OAuth autorizado e das políticas da instituição. Não execute a prévia como um site público.

## Como funciona o acompanhamento operacional

Fontes autorizadas (Drive, GitHub opcional e Tactiq) são lidas pelo agente e seus conectores. A análise é consolidada no painel local e nos registros privados. **O HTML e este repositório não executam essa busca por conta própria.** Conexões e automações da conta não são transferidas ao clonar o projeto.

A aplicação web lê dados consolidados na planilha; o botão de atualização não varre o Drive nem busca transcrições. Ela também não sincroniza as decisões do painel HTML automaticamente.

## Princípios

- Somente leitura dos trabalhos e repositórios dos estudantes.
- Arquivo modificado não equivale a avanço acadêmico.
- Fonte inacessível não equivale a inatividade.
- Transcrição registra compromissos, mas não prova entrega.
- Recomendações pendentes de revisão e decisões manuais preservadas.
- Sem envio automático de mensagens, atribuição automática de notas ou execução de código dos alunos.

## Segurança e privacidade

Não versionar `.env`, tokens, chaves, bancos SQLite, backups, transcrições, notas, e-mails ou links privados dos estudantes. O `.gitignore` ajuda, mas não remove informações incorporadas a arquivos de código: revise cada diff antes de publicar.

O repositório privado não substitui uma política de acesso e retenção. A retenção desejada de seis meses ainda não está implementada de ponta a ponta. Não há declaração automática de conformidade institucional ou jurídica.

## Limitações e próximos passos

1. Validar a execução agendada local sem intervenção e registrar falhas por fonte.
2. Separar dados privados do código do painel operacional e centralizar datas e estado.
3. Reconciliar decisões locais e planilha com controle de conflitos.
4. Validar rubricas por modalidade de trabalho e revisar extrações de transcrições.
5. Completar política de retenção, recuperação e controle de acesso antes de hospedagem.

Publicar código no GitHub **não hospeda a aplicação nem ativa as automações**. GitHub Pages não foi habilitado.

## Identidade visual

O piloto utiliza a identidade CESAR School fornecida pela orientadora. Sua presença neste repositório não implica licença de uso da marca ou autorização para redistribuição pública.
