import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
// import * as Notifications from 'expo-notifications';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getDatabase } from '../database/initializeDatabase';

// Configura o handler de notificações (fica registrado globalmente)
// Notifications.setNotificationHandler({
//   handleNotification: async () => ({
//     shouldShowBanner: true,
//     shouldShowList: true,
//     shouldPlaySound: true,
//     shouldSetBadge: true,
//   }),
// });

// Listener global para reagendamento automático
// Notifications.addNotificationReceivedListener(async (notification) => {
//   const { identifier } = notification.request;
//   // Se a notificação for do horário exato, tenta reagendar a próxima
//   if (identifier && identifier.includes('_exato')) {
//     const medId = identifier.replace('_exato', '');
//     try {
//       const db = await getDatabase();
//       const med = await db.getFirstAsync<Medication>('SELECT * FROM medicamentos WHERE id = ?', [medId]);
//       if (med && med.status_ativo === 1) {
//         await scheduleNextAlarm(med);
//       }
//     } catch (e) {
//       console.warn("Falha ao reagendar notificação recebida:", e);
//     }
//   }
// });

// ==========================================
// UTILITÁRIOS DE NOTIFICAÇÃO
// ==========================================

/**
 * Solicita permissão de notificação ao usuário (Android 13+).
 * Retorna true se a permissão foi concedida.
 */
async function ensureNotificationPermission(): Promise<boolean> {
  // const { status: existingStatus } = await Notifications.getPermissionsAsync();
  // let finalStatus = existingStatus;
  // if (existingStatus !== 'granted') {
  //   const { status } = await Notifications.requestPermissionsAsync();
  //   finalStatus = status;
  // }
  // return finalStatus === 'granted';
  return false;
}

async function cancelAlarm(medId: string) {
  try {
    // await Notifications.cancelScheduledNotificationAsync(medId + '_aviso');
    // await Notifications.cancelScheduledNotificationAsync(medId + '_exato');
  } catch (e) {
    // Silenciar erro se o ID de notificação não existir
    console.warn('Aviso ao cancelar alarme:', e);
  }
}

async function scheduleNextAlarm(med: Medication) {
  await cancelAlarm(med.id);

  if (med.status_ativo !== 1) return;

  // Verifica permissão antes de agendar
  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) {
    console.warn('⚠️ Permissão de notificação negada. Alarme não agendado.');
    return;
  }

  const db = await getDatabase();
  const perfil = await db.getFirstAsync<{ nome: string }>('SELECT nome FROM perfis WHERE id = ?', [String(med.perfil_id)]);
  const pacienteNome = perfil ? perfil.nome : 'o paciente';

  // Usa o horário original definido pelo usuário (timezone local preservado)
  const baseDate = new Date(med.data_inicio);
  const now = new Date();
  let nextDose = new Date(baseDate.getTime());

  // Avança doses até encontrar a próxima futura
  while (nextDose <= now) {
    nextDose = new Date(nextDose.getTime() + med.frequencia_horas * 60 * 60 * 1000);
  }

  const minutosAntecedencia = 10; 
  const tempoAviso = new Date(nextDose.getTime() - (minutosAntecedencia * 60000));

  const triggerAviso = Math.max(1, (tempoAviso.getTime() - now.getTime()) / 1000);
  const triggerExato = Math.max(1, (nextDose.getTime() - now.getTime()) / 1000);

  if (triggerAviso > 1) {
    // await Notifications.scheduleNotificationAsync({
    //   identifier: med.id + '_aviso',
    //   content: {
    //     title: '⏳ Prepare-se!',
    //     body: `Faltam ${minutosAntecedencia} minutos para o remédio de ${pacienteNome}: ${med.nome}.`,
    //   },
    //   trigger: { seconds: triggerAviso },
    // });
  }

  if (triggerExato > 1) {
    // await Notifications.scheduleNotificationAsync({
    //   identifier: med.id + '_exato',
    //   content: {
    //     title: '⏰ Hora do Remédio!',
    //     body: `Está na hora de dar ${med.nome} para ${pacienteNome}.`,
    //     sound: true,
    //   },
    //   trigger: { seconds: triggerExato },
    // });
  }
}

// ==========================================
// TIPOS
// ==========================================

export interface Medication {
  id: string; perfil_id: string; nome: string; tipo_dosagem: string;
  quantidade_dose: number; frequencia_horas: number; data_inicio: string;
  duracao_dias: number | null; observacoes: string; tags_uso: string; 
  estoque_atual: number; estoque_minimo: number; status_ativo: number;
}

interface MedicationStore {
  medications: Medication[];
  loadMedications: (perfil_id: string) => Promise<void>;
  addMedication: (medication: Omit<Medication, 'id' | 'status_ativo'>) => Promise<void>;
  updateMedication: (medication: Medication) => Promise<void>;
  takeMedication: (med: Medication) => Promise<void>; 
  undoMedication: (med: Medication) => Promise<void>;
  undoSpecificDose: (historyId: string, medId: string) => Promise<void>;
  pauseMedication: (med: Medication) => Promise<void>;
  deleteMedicationForced: (med: Medication) => Promise<void>;
  restockMedication: (med: Medication, quantidadeAdicional: number) => Promise<void>;
  replaceMedication: (oldMed: Medication, novoEstoque: number) => Promise<void>;
  checkHasHistory: (medId: string) => Promise<boolean>;
  verifyDoseInterval: (med: Medication) => Promise<{ allowed: boolean; message: string }>;
  generatePDFReport: (perfil: any, tipoReport: 'SEMANAL' | 'LAUDO' | 'ADERENCIA_7D' | 'ADERENCIA_30D' | 'ADERENCIA_TUDO') => Promise<void>;
}

// ==========================================
// STORE
// ==========================================

export const useMedicationStore = create<MedicationStore>((set, get) => ({
  medications: [],

  loadMedications: async (perfil_id) => {
    try {
      const db = await getDatabase();
      
      // Busca todos os ativos primeiro
      let ativos = await db.getAllAsync<Medication>(
        'SELECT * FROM medicamentos WHERE perfil_id = ? AND status_ativo = 1 ORDER BY nome ASC',
        [String(perfil_id)]
      );

      // Verificação de expiração automática
      const hoje = new Date();
      let teveMudanca = false;

      for (let med of ativos) {
        if (med.duracao_dias && med.duracao_dias > 0) {
          const dataFim = new Date(med.data_inicio);
          dataFim.setDate(dataFim.getDate() + med.duracao_dias);
          
          if (hoje > dataFim) {
            // Expirou! Desativa e cancela alarme
            await db.runAsync('UPDATE medicamentos SET status_ativo = 0 WHERE id = ?', [med.id]);
            await cancelAlarm(med.id);
            teveMudanca = true;
          }
        }
      }

      // Se algo expirou, busca de novo
      if (teveMudanca) {
        ativos = await db.getAllAsync<Medication>(
          'SELECT * FROM medicamentos WHERE perfil_id = ? AND status_ativo = 1 ORDER BY nome ASC',
          [String(perfil_id)]
        );
      }

      set({ medications: ativos });
    } catch (error) {
      console.error('Erro ao carregar medicamentos:', error);
      throw error;
    }
  },

  addMedication: async (med) => {
    try {
      const db = await getDatabase();
      const id = Crypto.randomUUID();
      await db.runAsync(
        `INSERT INTO medicamentos (id, perfil_id, nome, tipo_dosagem, quantidade_dose, frequencia_horas, data_inicio, duracao_dias, observacoes, tags_uso, estoque_atual, estoque_minimo, status_ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [id, String(med.perfil_id), String(med.nome), String(med.tipo_dosagem), Number(med.quantidade_dose), Number(med.frequencia_horas), String(med.data_inicio), med.duracao_dias ? Number(med.duracao_dias) : null, med.observacoes || '', med.tags_uso || '[]', Number(med.estoque_atual), Number(med.estoque_minimo)]
      );
      
      const newMed = { ...med, id, status_ativo: 1 } as Medication;
      await scheduleNextAlarm(newMed);
      await get().loadMedications(med.perfil_id);
    } catch (error) {
      console.error('Erro ao adicionar medicamento:', error);
      throw error;
    }
  },

  updateMedication: async (med) => {
    try {
      const db = await getDatabase();
      await db.runAsync(
        `UPDATE medicamentos SET nome = ?, tipo_dosagem = ?, quantidade_dose = ?, frequencia_horas = ?, data_inicio = ?, duracao_dias = ?, observacoes = ?, tags_uso = ?, estoque_atual = ?, estoque_minimo = ? WHERE id = ?`,
        [String(med.nome), String(med.tipo_dosagem), Number(med.quantidade_dose), Number(med.frequencia_horas), String(med.data_inicio), med.duracao_dias ? Number(med.duracao_dias) : null, med.observacoes || '', med.tags_uso || '[]', Number(med.estoque_atual), Number(med.estoque_minimo), String(med.id)]
      );
      await scheduleNextAlarm(med);
      await get().loadMedications(med.perfil_id);
    } catch (error) {
      console.error('Erro ao atualizar medicamento:', error);
      throw error;
    }
  },

  verifyDoseInterval: async (med) => {
    try {
      const db = await getDatabase();
      const lastDose = await db.getFirstAsync<{ data_hora_tomada: string }>(
        'SELECT data_hora_tomada FROM historico_doses WHERE medicamento_id = ? AND status = "TOMADO" ORDER BY data_hora_tomada DESC LIMIT 1',
        [String(med.id)]
      );
      if (!lastDose) return { allowed: true, message: "" };

      const ultimaTomada = new Date(lastDose.data_hora_tomada);
      const agora = new Date();
      const diferencaHoras = (agora.getTime() - ultimaTomada.getTime()) / (1000 * 60 * 60);

      if (diferencaHoras < (med.frequencia_horas - 0.5)) {
        const horasFaltando = Math.ceil(med.frequencia_horas - diferencaHoras);
        return { allowed: false, message: `O paciente já tomou este remédio recentemente!\n\nA próxima dose deve ser em aproximadamente ${horasFaltando} hora(s).` };
      }
      return { allowed: true, message: "" };
    } catch (error) { return { allowed: true, message: "" }; }
  },

  takeMedication: async (med) => {
    try {
      const db = await getDatabase();
      const historyId = Crypto.randomUUID();
      const dataHora = new Date().toISOString();
      const novoEstoque = (Number(med.estoque_atual) || 0) - (Number(med.quantidade_dose) || 0);

      await db.runAsync('INSERT INTO historico_doses (id, medicamento_id, data_hora_tomada, status) VALUES (?, ?, ?, ?)', [historyId, String(med.id), dataHora, 'TOMADO']);
      await db.runAsync('UPDATE medicamentos SET estoque_atual = ? WHERE id = ?', [novoEstoque, String(med.id)]);
      
      await scheduleNextAlarm(med); 
      await get().loadMedications(med.perfil_id);
    } catch (error) {
      console.error('Erro ao registrar dose:', error);
      throw error;
    }
  },

  undoMedication: async (med) => {
    try {
      const db = await getDatabase();
      const lastDose = await db.getFirstAsync<{ id: string }>('SELECT id FROM historico_doses WHERE medicamento_id = ? AND status = "TOMADO" ORDER BY data_hora_tomada DESC LIMIT 1', [String(med.id)]);
      if (lastDose) {
        await db.runAsync('DELETE FROM historico_doses WHERE id = ?', [String(lastDose.id)]);
        const novoEstoque = (Number(med.estoque_atual) || 0) + (Number(med.quantidade_dose) || 0);
        await db.runAsync('UPDATE medicamentos SET estoque_atual = ? WHERE id = ?', [novoEstoque, String(med.id)]);
        
        await scheduleNextAlarm(med);
        await get().loadMedications(med.perfil_id);
      } else { throw new Error("Nenhuma dose encontrada."); }
    } catch (error) { throw error; }
  },

  undoSpecificDose: async (historyId, medId) => {
    try {
      const db = await getDatabase();
      const med = await db.getFirstAsync<Medication>('SELECT * FROM medicamentos WHERE id = ?', [medId]);
      
      if (med) {
        // Apaga do histórico
        await db.runAsync('DELETE FROM historico_doses WHERE id = ?', [historyId]);
        
        // Devolve o estoque
        const novoEstoque = (Number(med.estoque_atual) || 0) + (Number(med.quantidade_dose) || 0);
        await db.runAsync('UPDATE medicamentos SET estoque_atual = ? WHERE id = ?', [novoEstoque, medId]);
        
        await scheduleNextAlarm(med);
        await get().loadMedications(med.perfil_id);
      }
    } catch (error) {
      console.error('Erro ao estornar dose:', error);
      throw error;
    }
  },

  pauseMedication: async (med) => {
    try {
      const db = await getDatabase();
      await db.runAsync('UPDATE medicamentos SET status_ativo = 2 WHERE id = ?', [String(med.id)]);
      await cancelAlarm(med.id);
      await get().loadMedications(med.perfil_id);
    } catch (error) {
      console.error('Erro ao pausar medicamento:', error);
      throw error;
    }
  },

  deleteMedicationForced: async (med) => {
    try {
      const db = await getDatabase();
      await db.runAsync('DELETE FROM historico_doses WHERE medicamento_id = ?', [String(med.id)]);
      await db.runAsync('DELETE FROM medicamentos WHERE id = ?', [String(med.id)]);
      await cancelAlarm(med.id);
      await get().loadMedications(med.perfil_id);
    } catch (error) {
      console.error('Erro ao excluir medicamento:', error);
      throw error;
    }
  },

  restockMedication: async (med, quantidadeAdicional) => {
    try {
      const db = await getDatabase();
      const novoEstoque = Number(med.estoque_atual) + Number(quantidadeAdicional);
      await db.runAsync('UPDATE medicamentos SET estoque_atual = ? WHERE id = ?', [novoEstoque, String(med.id)]);
      await get().loadMedications(med.perfil_id);
    } catch (error) {
      console.error('Erro ao repor estoque:', error);
      throw error;
    }
  },

  replaceMedication: async (oldMed, novoEstoque) => {
    try {
      const db = await getDatabase();
      await db.runAsync('UPDATE medicamentos SET status_ativo = 0 WHERE id = ?', [String(oldMed.id)]);
      await cancelAlarm(oldMed.id);
      
      const newId = Crypto.randomUUID();
      await db.runAsync(
        `INSERT INTO medicamentos (id, perfil_id, nome, tipo_dosagem, quantidade_dose, frequencia_horas, data_inicio, duracao_dias, observacoes, tags_uso, estoque_atual, estoque_minimo, status_ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [newId, String(oldMed.perfil_id), String(oldMed.nome), String(oldMed.tipo_dosagem), Number(oldMed.quantidade_dose), Number(oldMed.frequencia_horas), String(oldMed.data_inicio), oldMed.duracao_dias, oldMed.observacoes || '', oldMed.tags_uso || '[]', Number(novoEstoque), Number(oldMed.estoque_minimo)]
      );
      
      const newMed = { ...oldMed, id: newId, estoque_atual: novoEstoque, status_ativo: 1 };
      await scheduleNextAlarm(newMed);
      await get().loadMedications(oldMed.perfil_id);
    } catch (error) {
      console.error('Erro ao substituir medicamento:', error);
      throw error;
    }
  },

  checkHasHistory: async (medId) => {
    try {
      const db = await getDatabase();
      const dose = await db.getFirstAsync('SELECT id FROM historico_doses WHERE medicamento_id = ? LIMIT 1', [String(medId)]);
      return !!dose;
    } catch (error) { return false; }
  },

  // ==========================================
  // MÓDULO DE RELATÓRIO MÚLTIPLO
  // ==========================================
  generatePDFReport: async (perfil, tipoReport) => {
    try {
      const db = await getDatabase();
      const meds = await db.getAllAsync<Medication>('SELECT * FROM medicamentos WHERE perfil_id = ?', [String(perfil.id)]);
      
      let htmlContent = '';
      const hoje = new Date();
      const dataEmissao = `${hoje.toLocaleDateString('pt-BR')} às ${hoje.toLocaleTimeString('pt-BR')}`;

      // --- GERADOR: PLANEJAMENTO SEMANAL (GELADEIRA) ---
      if (tipoReport === 'SEMANAL') {
        const ativos = meds.filter(m => m.status_ativo === 1);
        let linhasPlanilha: { horario: string, nome: string, qtd: string, tags: string }[] = [];

        ativos.forEach(med => {
          let inicioBase = new Date(med.data_inicio);
          while (inicioBase < new Date(new Date().setHours(0,0,0,0))) {
             inicioBase = new Date(inicioBase.getTime() + med.frequencia_horas * 60 * 60 * 1000);
          }
          let fimDoDiaBase = new Date(inicioBase);
          fimDoDiaBase.setHours(23, 59, 59, 999);
          
          let doseBase = new Date(inicioBase);
          while (doseBase <= fimDoDiaBase) {
             linhasPlanilha.push({
               horario: doseBase.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
               nome: med.nome,
               qtd: `${med.quantidade_dose} ${med.tipo_dosagem.toLowerCase()}s`,
               tags: med.tags_uso ? JSON.parse(med.tags_uso).join(', ') : ''
             });
             doseBase = new Date(doseBase.getTime() + med.frequencia_horas * 60 * 60 * 1000);
          }
        });

        linhasPlanilha.sort((a, b) => a.horario.localeCompare(b.horario));
        
        htmlContent = `
          <html>
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <style>
                body { font-family: 'Helvetica', sans-serif; padding: 20px; color: #333; }
                h1 { color: #4CAF50; text-align: center; border-bottom: 2px solid #EEE; padding-bottom: 10px; }
                .info-box { background-color: #E8F5E9; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
                th, td { border: 1px solid #DDD; padding: 8px; text-align: center; }
                th { background-color: #4CAF50; color: #FFF; font-weight: bold; }
                .nome-med { text-align: left; font-weight: bold; }
                .tags-med { font-size: 11px; color: #666; font-weight: normal; display: block; }
                tr:nth-child(even) { background-color: #F9F9F9; }
                .box { width: 16px; height: 16px; border: 1px solid #999; display: inline-block; }
              </style>
            </head>
            <body>
              <h1>Planejamento Semanal</h1>
              <div class="info-box">
                <p><strong>Paciente:</strong> ${perfil.nome}</p>
                <p><strong>Gerado em:</strong> ${hoje.toLocaleDateString('pt-BR')}</p>
              </div>
              <table>
                <tr>
                  <th style="text-align: left;">Horário / Remédio</th>
                  <th>SEG</th><th>TER</th><th>QUA</th><th>QUI</th><th>SEX</th><th>SAB</th><th>DOM</th>
                </tr>
                ${linhasPlanilha.length > 0 ? linhasPlanilha.map(c => `
                  <tr>
                    <td class="nome-med">
                      <span style="color: #2E7D32;">${c.horario}</span> - ${c.nome} (${c.qtd})
                      ${c.tags ? `<span class="tags-med">${c.tags}</span>` : ''}
                    </td>
                    <td><div class="box"></div></td><td><div class="box"></div></td><td><div class="box"></div></td>
                    <td><div class="box"></div></td><td><div class="box"></div></td><td><div class="box"></div></td>
                    <td><div class="box"></div></td>
                  </tr>
                `).join('') : '<tr><td colspan="8">Nenhum medicamento programado.</td></tr>'}
              </table>
            </body>
          </html>
        `;
      } 
      // --- GERADOR: LAUDO CLÍNICO ---
      else if (tipoReport === 'LAUDO') {
        const ativos = meds.filter(m => m.status_ativo === 1);
        
        htmlContent = `
          <html>
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <style>
                body { font-family: 'Helvetica', sans-serif; padding: 20px; color: #333; }
                h1 { color: #2E66FF; text-align: center; border-bottom: 2px solid #EEE; padding-bottom: 10px; }
                .info-box { background-color: #F7F9FC; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #2E66FF; }
                h2 { color: #555; margin-top: 30px; font-size: 18px; border-bottom: 1px solid #EEE; padding-bottom: 5px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #DDD; padding: 12px; text-align: left; font-size: 14px; }
                th { background-color: #2E66FF; color: #FFF; font-weight: bold; }
                tr:nth-child(even) { background-color: #F9F9F9; }
              </style>
            </head>
            <body>
              <h1>Laudo Clínico de Tratamento</h1>
              <div class="info-box">
                <p><strong>Paciente:</strong> ${perfil.nome}</p>
                <p><strong>Diagnósticos / Histórico:</strong> ${perfil.diagnosticos || 'Não informado'}</p>
                <p><strong>Data de Emissão:</strong> ${dataEmissao}</p>
              </div>
              <h2>Remédios em Uso (Tratamento Ativo)</h2>
              <table>
                <tr><th>Remédio</th><th>Dose</th><th>Frequência</th><th>Dicas Clínicas (Tags)</th><th>Início do Uso</th></tr>
                ${ativos.length > 0 ? ativos.map(m => `
                  <tr>
                    <td><strong>${m.nome}</strong></td>
                    <td>${m.quantidade_dose} ${m.tipo_dosagem.toLowerCase()}s</td>
                    <td>A cada ${m.frequencia_horas}h</td>
                    <td>${m.tags_uso ? JSON.parse(m.tags_uso).join(', ') : '-'}</td>
                    <td>${new Date(m.data_inicio).toLocaleDateString('pt-BR')}</td>
                  </tr>
                `).join('') : '<tr><td colspan="5">Nenhum tratamento ativo.</td></tr>'}
              </table>
            </body>
          </html>
        `;
      }
      // --- GERADOR: RELATÓRIO DE ADERÊNCIA ---
      else {
        let dataLimite = new Date(0);
        let tituloPeriodo = "Histórico Completo";
        
        if (tipoReport === 'ADERENCIA_7D') {
          dataLimite = new Date();
          dataLimite.setDate(dataLimite.getDate() - 7);
          tituloPeriodo = "Últimos 7 Dias";
        } else if (tipoReport === 'ADERENCIA_30D') {
          dataLimite = new Date();
          dataLimite.setDate(dataLimite.getDate() - 30);
          tituloPeriodo = "Últimos 30 Dias";
        }
        
        const history = await db.getAllAsync<{nome: string, data_hora_tomada: string, status: string}>(
          `SELECT m.nome, h.data_hora_tomada, h.status 
           FROM historico_doses h JOIN medicamentos m ON h.medicamento_id = m.id 
           WHERE m.perfil_id = ? AND h.data_hora_tomada >= ? ORDER BY h.data_hora_tomada DESC`,
          [String(perfil.id), dataLimite.toISOString()]
        );

        const agrupado: Record<string, typeof history> = {};
        let totalDoses = history.length;
        let tomados = 0;
        
        history.forEach(h => {
          if (h.status === 'TOMADO') tomados++;
          const diaStr = new Date(h.data_hora_tomada).toLocaleDateString('pt-BR');
          if (!agrupado[diaStr]) agrupado[diaStr] = [];
          agrupado[diaStr].push(h);
        });

        const adesao = totalDoses > 0 ? Math.round((tomados / totalDoses) * 100) : 0;
        const adesaoCor = adesao >= 80 ? '#4CAF50' : adesao >= 50 ? '#FF9800' : '#F44336';

        htmlContent = `
          <html>
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <style>
                body { font-family: 'Helvetica', sans-serif; padding: 20px; color: #333; }
                h1 { color: #673AB7; text-align: center; border-bottom: 2px solid #EEE; padding-bottom: 10px; }
                .header-container { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
                .info-box { background-color: #F3E5F5; padding: 15px; border-radius: 8px; flex: 1; margin-right: 15px; border-left: 4px solid #673AB7; }
                .score-box { background-color: #FAFAFA; padding: 15px; border-radius: 8px; text-align: center; border: 1px solid #EEE; min-width: 120px; }
                .score-value { font-size: 32px; font-weight: bold; color: ${adesaoCor}; }
                h2 { color: #555; margin-top: 30px; font-size: 16px; background-color: #EEE; padding: 8px; border-radius: 4px; }
                table { width: 100%; border-collapse: collapse; margin-top: 5px; }
                th, td { border: 1px solid #DDD; padding: 10px; text-align: left; font-size: 14px; }
                th { background-color: #FAFAFA; color: #555; font-weight: bold; }
                .status-TOMADO { color: #4CAF50; font-weight: bold; }
                .status-ATRASADO { color: #F44336; font-weight: bold; }
              </style>
            </head>
            <body>
              <h1>Relatório de Aderência</h1>
              <div class="header-container">
                <div class="info-box">
                  <p><strong>Paciente:</strong> ${perfil.nome}</p>
                  <p><strong>Período:</strong> ${tituloPeriodo}</p>
                  <p><strong>Emissão:</strong> ${dataEmissao}</p>
                </div>
                <div class="score-box">
                  <div style="font-size: 12px; color: #777;">Taxa de Adesão</div>
                  <div class="score-value">${adesao}%</div>
                  <div style="font-size: 12px; color: #777; margin-top: 5px;">${tomados} de ${totalDoses} doses</div>
                </div>
              </div>
              
              ${Object.keys(agrupado).length > 0 ? Object.keys(agrupado).map(dia => `
                <h2>📅 Dia: ${dia}</h2>
                <table>
                  <tr><th>Horário</th><th>Remédio</th><th>Status</th></tr>
                  ${agrupado[dia].map(h => `
                    <tr>
                      <td style="width: 20%;">${new Date(h.data_hora_tomada).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</td>
                      <td>${h.nome}</td>
                      <td class="status-${h.status}">${h.status === 'TOMADO' ? '✓ Tomado' : '✗ Atrasado'}</td>
                    </tr>
                  `).join('')}
                </table>
              `).join('') : '<p style="text-align:center; margin-top: 50px; color: #777;">Nenhuma dose registrada neste período.</p>'}
            </body>
          </html>
        `;
      }

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: 'Documento RoyalCare' });
    } catch (error) {
      throw new Error(`Falha ao gerar PDF: ${error}`);
    }
  }
}));