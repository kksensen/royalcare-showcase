# 💚 RoyalCare - Sistema de Gestão de Medicamentos

## Inspiração
Este projeto nasceu de um desejo genuíno de cuidar. Inspirado por alguém muito especial — que me mostrou o quanto a saúde e o bem-estar de quem amamos importam — o aplicativo foi desenhado para que famílias e pacientes consigam se organizar e ter em mãos, de forma fácil e rápida, históricos de medicamentos, cronogramas, receitas e registros médicos. É a tecnologia a serviço do afeto e do cuidado.

---

## Visão do Projeto
O **RoyalCare** é uma aplicação mobile *offline-first* desenvolvida para simplificar, organizar e automatizar a gestão de terapias medicamentosas. O aplicativo transcende a função de um simples alarme, atuando como um assistente completo de saúde pessoal e familiar. Ele oferece controle de estoque preditivo, suporte a múltiplos perfis de usuários e geração automatizada de laudos clínicos e relatórios de aderência em PDF, garantindo aderência ao tratamento e facilitando o acompanhamento médico.

---

## Arquitetura e Stack Tecnológico
Para garantir performance e robustez, o projeto foi construído utilizando as melhores práticas do ecossistema mobile:
* **Front-end Mobile:** React Native com Expo (Expo Router para file-based routing).
* **Linguagem:** TypeScript (tipagem estrita com prevenção de erros e uso forte de Interfaces).
* **Armazenamento Local (Offline-first):** Expo SQLite (motor relacional local de alta performance).
* **Gerenciamento de Estado Global:** Zustand (Stores modulares: ProfileStore, MedicationStore, ScheduleStore, HistoryStore, TourStore).
* **Geração de Relatórios:** Expo Print (HTML-to-PDF engine) & Expo Sharing.
* **Componentização UI:** Componentes Customizados (ActionSheetModal flutuante, WeekCalendar).
* **Onboarding Contextual:** Sistema próprio de `FloatingTour` para instrução guiada de novos usuários.

---

## Regras de Negócio (Business Rules)
Estas regras ditam o comportamento do motor do aplicativo:

* **RN01 - Baixa de Estoque:** O sistema só subtrai a `quantidade_dose` do `estoque_atual` no momento exato em que o usuário confirma a ação "Tomar Remédio".
* **RN02 - Cálculo Heurístico de Doses:** A verificação de aderência não bloqueia o usuário se houver pequenas tolerâncias, mas impede doses repetidas acidentais calculando a dose registrada mais próxima do horário programado.
* **RN03 - Bloqueio de Exclusão (Soft Delete):** Um medicamento que possui histórico de doses não pode ser deletado do banco de dados para não quebrar relatórios antigos. Ele tem seu `status_ativo` alterado para `false`.
* **RN04 - Alerta de Estoque:** O sistema exibe um card visual de aviso crítico na Dashboard quando o `estoque_atual` atinge ou fica abaixo do `estoque_minimo`.
* **RN05 - Isolamento de Perfis:** Históricos, Medicamentos e Anexos são completamente isolados pelo ID do perfil ativo em uso.

---

## Requisitos e Funcionalidades Principais (Atualizadas)

### Funcionais
* **Gestão de Perfis & Prontuários:** Criar perfis, adicionar lista de diagnósticos e anexar arquivos (ex: receitas, laudos em imagem/PDF).
* **Cadastro Detalhado:** Cadastro de remédios com tipagem de dosagem, controle de estoque (atual e mínimo), tags clínicas e observações.
* **Dashboard Cronológica:** Visualização de timeline interativa do dia, controlada por um `WeekCalendar`.
* **Motor de Relatórios PDF:**
  * **Laudo Clínico:** Gera um "resumo do paciente", com diagnósticos e lista de tratamentos ativos para novas consultas médicas.
  * **Relatório de Adesão:** Calcula uma taxa matemática de sucesso (%) baseada nos últimos 7 ou 30 dias, agrupando as doses por dia no documento.
* **Sistema de Desfazer:** Permite desfazer uma dose caso marcada por acidente, devolvendo o estoque na mesma hora.
* **Histórico Completo:** Tela dedicada para visualizar, rolar e auditar todas as doses da vida do paciente.

### Não-Funcionais
* **Clean Code & Tratamento de Erros:** O código utiliza propagação de erros rigorosa nas Stores e componentes reutilizáveis.
* **Navegação Fluida:** Substituição de BottomSheets genéricos por Modais Centrais (Floating) para evitar conflitos com gestos nativos de OS modernos (iOS/Android).
* **Offline-first:** O aplicativo não requer nenhuma conexão com a internet para suas funcionalidades principais.

---

## Modelagem de Dados (Entity-Relationship - V5)

O banco de dados relacional (SQLite) foi modelado para suportar laudos complexos através de 4 tabelas principais conectadas.

### Tabela 1: perfis
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Identificador único do perfil |
| `nome` | String | Nome do paciente |
| `cor_avatar` | String | Código Hexadecimal (ex: #FF5733) |
| `diagnosticos` | String | Texto descrevendo doenças (usado no PDF Médico) |
| `data_criacao` | DateTime | Auditoria |

### Tabela 2: anexos_paciente (Nova V5)
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Identificador do anexo |
| `perfil_id` | UUID (FK)| Relacionamento com `perfis` |
| `nome_arquivo` | String | Nome dado ao arquivo |
| `uri` | String | Caminho local do arquivo no dispositivo |

### Tabela 3: medicamentos
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Identificador único |
| `perfil_id` | UUID (FK)| Relacionamento com `perfis` |
| `nome` | String | Ex: Losartana |
| `tipo_dosagem` | Enum | GOTAS, COMPRIMIDO, ML, POMADA |
| `quantidade_dose` | Number | Ex: 40 (gotas) ou 1 (comprimido) |
| `frequencia_horas` | Inteiro | Ex: 8 (em 8 horas) |
| `tags_uso` | JSON Array| Ex: "Em Jejum", "Após comer" |
| `estoque_atual` | Number | Saldo na caixa |
| `estoque_minimo` | Number | Gatilho para o Alerta na Dashboard |
| `status_ativo` | Boolean | True = Tratamento em curso |

### Tabela 4: historico_doses
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Identificador único da dose auditada |
| `medicamento_id` | UUID (FK)| Relacionamento com `medicamentos` |
| `data_hora_tomada` | DateTime| Timestamp exato que a dose foi clicada |
| `status` | Enum | TOMADO, ATRASADO |

---

<div align="center">
  <br/>
  <i>Desenvolvido com muito amor 💚 e dedicação extrema.</i>
  <br/>
  <strong>For my Princess 🌹💕</strong>
  <br/><br/>
</div>