import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import { useProfileStore } from '../../store/useProfileStore';
import { useMedicationStore } from '../../store/useMedicationStore';
import { useScheduleStore, ScheduledDose } from '../../store/useScheduleStore';
import { useHistoryStore, HistoryRecord } from '../../store/useHistoryStore';
import { useTourStore } from '../../store/useTourStore';
import { colors } from '../../styles/theme';
import { ActionSheetModal } from '../../components/ActionSheetModal';
import { WeekCalendar } from '../../components/WeekCalendar';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function HomeScreen() {
  const { activeProfile, loadProfiles, addProfile, profiles, setActiveProfile, setShouldOpenFicha } = useProfileStore();
  const { medications, takeMedication, generatePDFReport, undoSpecificDose } = useMedicationStore();
  const { dailySchedule, loadDailySchedule, isLoading: isScheduleLoading } = useScheduleStore();
  const { recentHistory, loadRecentHistory, deleteHistoryRecord, isLoading: isHistoryLoading } = useHistoryStore();
  const router = useRouter();
  
  const [nomePai, setNomePai] = useState('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showProfileSelector, setShowProfileSelector] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  
  // Sheet states
  const [historySheetVisible, setHistorySheetVisible] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<HistoryRecord | null>(null);
  const [pdfSheetVisible, setPdfSheetVisible] = useState(false);

  // Time travel states
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleAvatarPress = () => {
    setActionSheetVisible(true);
  };

  const handleHistoryPress = (hist: HistoryRecord) => {
    setSelectedHistory(hist);
    setHistorySheetVisible(true);
  };

  const handleUndoHistory = async () => {
    if (!selectedHistory) return;
    try {
      await undoSpecificDose(selectedHistory.id, selectedHistory.medicamento_id);
      await deleteHistoryRecord(selectedHistory.id);
      Alert.alert("Desfeito", "O registro foi apagado e o estoque restaurado.");
    } catch (e) {
      Alert.alert("Erro", "Falha ao desfazer registro.");
    }
    setHistorySheetVisible(false);
  };

  // Initialization
  useEffect(() => {
    loadProfiles();
  }, []);

  // Sync data on profile or date change
  useEffect(() => { 
    if (activeProfile) {
      loadDailySchedule(activeProfile.id, selectedDate);
      loadRecentHistory(activeProfile.id, 5); // Carrega os últimos 5 históricos
    } 
  }, [activeProfile, medications, selectedDate]); // Adicionei medications e selectedDate pra forçar refresh

  const handleCreateFirstProfile = async () => {
    const nomeLimpo = nomePai.trim();
    if (!nomeLimpo) {
      Alert.alert('Aviso', 'Digite o nome do paciente para continuar.');
      return;
    }
    try {
      await addProfile(nomeLimpo, colors.primary);
      useTourStore.getState().startTour();
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível criar o perfil. Tente novamente.');
    }
  };

  const handleTakeMedication = async (dose: ScheduledDose) => {
    if (dose.medicamento.estoque_atual <= 0) {
      Alert.alert('Estoque Zerado', `O estoque de ${dose.medicamento.nome} está em 0. Reponha na aba Farmácia antes de registrar uma dose.`);
      return;
    }

    const agora = new Date();
    
    // Validates early administration (1 hour threshold)
    const difHorasAdiantado = (dose.horarioProgramado.getTime() - agora.getTime()) / (1000 * 60 * 60);
    if (difHorasAdiantado > 1) {
      Alert.alert(
        '⚠️ Horário Adiantado',
        `Esta dose está agendada para ${dose.horarioProgramado.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}. Ainda faltam aprox. ${Math.ceil(difHorasAdiantado)} horas.\n\nDeseja registrar mesmo assim?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Forçar Registro', style: 'destructive', onPress: () => proceedTakeMedication(dose) }
        ]
      );
      return;
    }

    // Verifica intervalo desde a última dose (Evitar Overdose)
    const { verifyDoseInterval } = useMedicationStore.getState();
    const intervalCheck = await verifyDoseInterval(dose.medicamento);
    
    if (!intervalCheck.allowed) {
      Alert.alert(
        '⚠️ Alerta de Dose Recente',
        `${intervalCheck.message}\n\nDeseja forçar o registro desta dose extra?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Forçar Registro', style: 'destructive', onPress: () => proceedTakeMedication(dose) }
        ]
      );
      return;
    }

    // Se passou em tudo, registra normal
    proceedTakeMedication(dose);
  };

  const proceedTakeMedication = async (dose: ScheduledDose) => {
    try {
      await takeMedication(dose.medicamento);
      const novoEstoque = dose.medicamento.estoque_atual - dose.medicamento.quantidade_dose;
      if (novoEstoque <= dose.medicamento.estoque_minimo) {
        Alert.alert('⚠️ Atenção: Estoque Baixo!', `Dose registrada, mas restam apenas ${novoEstoque} unidades.`);
      }
      loadDailySchedule(activeProfile!.id);
      loadRecentHistory(activeProfile!.id, 5);
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível registrar a dose. Tente novamente.');
    }
  };

  const handleGenerateReport = () => {
    if (!activeProfile || isGeneratingPdf) return;
    setPdfSheetVisible(true);
  };

  if (!activeProfile) {
    return (
      <View style={styles.containerSetup}>
        <FontAwesome5 name="heartbeat" size={60} color={colors.primary} style={{ marginBottom: 20 }} />
        <Text style={styles.titleSetup}>Bem-vindo ao RoyalCare</Text>
        <Text style={styles.subtitleSetup}>Quem você vai cuidar hoje?</Text>
        <TextInput style={styles.input} placeholder="Ex: Sr. João (Meu Pai)" value={nomePai} onChangeText={setNomePai} placeholderTextColor={colors.textSecondary} />
        <TouchableOpacity style={[styles.buttonSetup, !nomePai.trim() && styles.buttonDisabled]} onPress={handleCreateFirstProfile} disabled={!nomePai.trim()}>
          <Text style={styles.buttonTextSetup}>Começar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Estatísticas rápidas do dia
  const dosesTomadas = dailySchedule.filter(d => d.status === 'TOMADO').length;
  const totalDoses = dailySchedule.length;
  const dosesAtrasadas = dailySchedule.filter(d => d.status === 'ATRASADO').length;

  return (
    <View style={styles.container}>
      {/* HEADER REDESIGN (CareSync Inspired) */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity 
            style={styles.profileSelector} 
            onPress={handleAvatarPress}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{activeProfile.nome.charAt(0).toUpperCase()}</Text>
            </View>
            <View>
              <Text style={styles.welcomeText}>Bem-vindo(a),</Text>
              <View style={styles.profileNameRow}>
                <Text style={styles.patientName}>{activeProfile.nome}</Text>
                <MaterialIcons name="keyboard-arrow-down" size={20} color="#FFF" />
              </View>
            </View>
          </TouchableOpacity>
          <View style={styles.headerIcons}>
            <TouchableOpacity onPress={handleGenerateReport} disabled={isGeneratingPdf}>
              {isGeneratingPdf ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialIcons name="picture-as-pdf" size={26} color="#FFF" />}
            </TouchableOpacity>
          </View>
        </View>

        {showProfileSelector && (
          <View style={styles.profileDropdown}>
            {profiles.map(p => (
              <TouchableOpacity key={p.id} style={styles.dropdownItem} onPress={() => { setActiveProfile(p); setShowProfileSelector(false); }}>
                <Text style={[styles.dropdownItemText, activeProfile.id === p.id && { fontWeight: 'bold', color: colors.primary }]}>{p.nome}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Resumo do Dia */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{totalDoses}</Text>
            <Text style={styles.statLabel}>Hoje</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: colors.success }]}>{dosesTomadas}</Text>
            <Text style={styles.statLabel}>Tomadas</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statValue, dosesAtrasadas > 0 && { color: colors.danger }]}>{dosesAtrasadas}</Text>
            <Text style={styles.statLabel}>Atrasadas</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* ALERTA DE ESTOQUE */}
        {medications.filter(m => Number(m.estoque_atual) <= Number(m.estoque_minimo)).length > 0 && (
          <TouchableOpacity style={styles.stockAlertCard} onPress={() => router.push('/medications')}>
            <MaterialIcons name="warning" size={24} color={colors.danger} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.stockAlertTitle}>Atenção ao Estoque!</Text>
              <Text style={styles.stockAlertText}>Você tem remédios acabando. Clique para ver.</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={colors.danger} />
          </TouchableOpacity>
        )}

        <WeekCalendar selectedDate={selectedDate} onDateChange={setSelectedDate} />

        {/* Schedule Section */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Cronograma</Text>
            <Text style={styles.sectionSubtitle}>
              {selectedDate.getDate() === new Date().getDate() && selectedDate.getMonth() === new Date().getMonth() && selectedDate.getFullYear() === new Date().getFullYear() ? 'Hoje' : selectedDate.toLocaleDateString('pt-BR')}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setShowDatePicker(true)} style={{ padding: 8, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
            <MaterialIcons name="calendar-today" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="default"
            onChange={(event, date) => {
              setShowDatePicker(false);
              if (date) setSelectedDate(date);
            }}
          />
        )}

        {isScheduleLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
        ) : dailySchedule.length === 0 ? (
          <View style={styles.emptyCard}>
            <FontAwesome5 name="check-circle" size={40} color={colors.primaryLight} />
            <Text style={styles.emptyTitle}>Dia livre!</Text>
            <Text style={styles.emptyText}>Nenhum remédio programado para hoje.</Text>
          </View>
        ) : (
          <View style={styles.timeline}>
            {dailySchedule.map((dose, index) => {
              const isLast = index === dailySchedule.length - 1;
              return (
                <View key={dose.id} style={styles.timelineRow}>
                  {/* Timeline Visual Indicator */}
                  <View style={styles.timelineIndicator}>
                    <View style={[
                      styles.timelineDot,
                      dose.status === 'TOMADO' && styles.dotSuccess,
                      dose.status === 'ATRASADO' && styles.dotDanger,
                      dose.status === 'PENDENTE' && styles.dotPending
                    ]} />
                    {!isLast && <View style={[styles.timelineLine, dose.status === 'TOMADO' && styles.lineSuccess]} />}
                  </View>

                  {/* Dose Card */}
                  <View style={[styles.doseCard, dose.status === 'ATRASADO' && styles.doseCardDanger]}>
                    <View style={styles.doseTimeContainer}>
                      <Text style={[styles.doseTime, dose.status === 'ATRASADO' && { color: colors.danger }]}>
                        {dose.horarioProgramado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      {dose.status === 'ATRASADO' && <View style={styles.badgeDanger}><Text style={styles.badgeText}>Atrasado</Text></View>}
                      {dose.status === 'TOMADO' && <View style={styles.badgeSuccess}><Text style={styles.badgeText}>OK</Text></View>}
                    </View>
                    
                    <Text style={styles.doseName}>{dose.medicamento.nome}</Text>
                    <Text style={styles.doseDetails}>{dose.medicamento.quantidade_dose} {dose.medicamento.tipo_dosagem.toLowerCase()}s</Text>
                    
                    {dose.status !== 'TOMADO' && (
                      <TouchableOpacity 
                        style={[styles.takeBtn, dose.status === 'ATRASADO' ? styles.takeBtnDanger : styles.takeBtnPrimary]}
                        onPress={() => handleTakeMedication(dose)}
                      >
                        <MaterialIcons name="check" size={16} color="#FFF" />
                        <Text style={styles.takeBtnText}>Marcar Tomado</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Recent History Section */}
        <View style={[styles.sectionHeader, { marginTop: 30 }]}>
          <Text style={styles.sectionTitle}>Últimas Doses Registradas</Text>
        </View>

        {isHistoryLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : recentHistory.length === 0 ? (
          <Text style={styles.emptyTextCenter}>Nenhum histórico registrado ainda.</Text>
        ) : (
          <View style={styles.historyContainer}>
            {recentHistory.map((hist) => (
              <TouchableOpacity key={hist.id} style={styles.historyRow} onPress={() => handleHistoryPress(hist)}>
                <View style={styles.historyIconBox}>
                  <MaterialIcons name="done-all" size={18} color={colors.success} />
                </View>
                <View style={styles.historyContent}>
                  <Text style={styles.historyName}>{hist.nome_medicamento}</Text>
                  <Text style={styles.historyDate}>{new Date(hist.data_hora_tomada).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</Text>
                </View>
                <MaterialIcons name="more-vert" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
            
            <TouchableOpacity 
              style={{ marginTop: 15, paddingVertical: 10, alignItems: 'center' }} 
              onPress={() => router.push('/history')}
            >
              <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: 15 }}>
                Ver Histórico Completo ➔
              </Text>
            </TouchableOpacity>
          </View>
        )}
        </ScrollView>
      
      <ActionSheetModal
        visible={actionSheetVisible}
        title="Ações do Paciente"
        subtitle={`O que deseja fazer com ${activeProfile?.nome}?`}
        onClose={() => setActionSheetVisible(false)}
        options={[
          {
            label: 'Ver Prontuário Médico',
            icon: 'assignment',
            color: colors.primary,
            onPress: () => {
              setShouldOpenFicha(true);
              router.push('/profiles');
            }
          },
          {
            label: 'Trocar Paciente',
            icon: 'people',
            onPress: () => setShowProfileSelector(true)
          }
        ]}
      />

      <ActionSheetModal
        visible={historySheetVisible}
        title="Opções do Registro"
        subtitle={selectedHistory ? `${selectedHistory.nome_medicamento} em ${new Date(selectedHistory.data_hora_tomada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
        onClose={() => setHistorySheetVisible(false)}
        options={[
          {
            label: 'Apagar e Desfazer Dose',
            icon: 'delete-outline',
            isDestructive: true,
            onPress: handleUndoHistory
          }
        ]}
      />
      <ActionSheetModal
        visible={pdfSheetVisible}
        title="Exportar Documento"
        subtitle="Qual formato de PDF você deseja gerar?"
        onClose={() => setPdfSheetVisible(false)}
        options={[
          {
            label: 'Laudo Clínico (Médico)',
            icon: 'medical-services',
            color: colors.primary,
            onPress: async () => {
              setIsGeneratingPdf(true);
              try { await generatePDFReport(activeProfile!, 'LAUDO'); } 
              catch (e) { Alert.alert('Erro', 'Falha ao gerar o laudo.'); }
              finally { setIsGeneratingPdf(false); }
            }
          },
          {
            label: 'Relatório Adesão (7 Dias)',
            icon: 'insert-chart-outlined',
            color: colors.primary,
            onPress: async () => {
              setIsGeneratingPdf(true);
              try { await generatePDFReport(activeProfile!, 'ADERENCIA_7D'); } 
              catch (e) { Alert.alert('Erro', 'Falha ao gerar relatório.'); }
              finally { setIsGeneratingPdf(false); }
            }
          },
          {
            label: 'Relatório Adesão (30 Dias)',
            icon: 'insert-chart',
            color: colors.primary,
            onPress: async () => {
              setIsGeneratingPdf(true);
              try { await generatePDFReport(activeProfile!, 'ADERENCIA_30D'); } 
              catch (e) { Alert.alert('Erro', 'Falha ao gerar relatório.'); }
              finally { setIsGeneratingPdf(false); }
            }
          },
          {
            label: 'Planejamento (Geladeira)',
            icon: 'calendar-month',
            color: colors.textSecondary,
            onPress: async () => {
              setIsGeneratingPdf(true);
              try { await generatePDFReport(activeProfile!, 'SEMANAL'); } 
              catch (e) { Alert.alert('Erro', 'Falha ao gerar o planejamento.'); }
              finally { setIsGeneratingPdf(false); }
            }
          }
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  containerSetup: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 20 },
  titleSetup: { fontSize: 26, fontWeight: 'bold', color: colors.text, textAlign: 'center' },
  subtitleSetup: { fontSize: 16, color: colors.textSecondary, marginTop: 8, textAlign: 'center', marginBottom: 30 },
  input: { width: '100%', minHeight: 55, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 15, borderWidth: 1, borderColor: colors.border, marginBottom: 15, fontSize: 16 },
  buttonSetup: { width: '100%', minHeight: 55, paddingVertical: 15, backgroundColor: colors.primary, borderRadius: 25, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },
  buttonDisabled: { backgroundColor: colors.border },
  buttonTextSetup: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  
  container: { flex: 1, backgroundColor: colors.background },
  
  // Header
  header: { backgroundColor: colors.primary, padding: 25, paddingTop: 60, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, elevation: 8, shadowColor: colors.primaryDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, zIndex: 10 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
  profileSelector: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 2, borderColor: '#FFF' },
  avatarText: { fontSize: 18, fontWeight: 'bold', color: '#FFF' },
  welcomeText: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  patientName: { fontSize: 20, fontWeight: 'bold', color: '#FFF' },
  headerIcons: { flexDirection: 'row', gap: 15 },
  
  profileDropdown: { position: 'absolute', top: 70, left: 0, backgroundColor: colors.surface, borderRadius: 12, padding: 8, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, zIndex: 20, minWidth: 150 },
  dropdownItem: { paddingVertical: 10, paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: colors.background },
  dropdownItemText: { fontSize: 15, color: colors.text },
  
  // Stats
  statsContainer: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 20, paddingVertical: 15, paddingHorizontal: 10, justifyContent: 'space-around', alignItems: 'center' },
  statBox: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 22, fontWeight: 'bold', color: colors.text },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: colors.border },
  
  // Stock Alert
  stockAlertCard: { backgroundColor: colors.surface, borderLeftColor: colors.danger, borderLeftWidth: 4, borderRadius: 12, padding: 15, flexDirection: 'row', alignItems: 'center', marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3 },
  stockAlertTitle: { fontWeight: 'bold', color: colors.danger, fontSize: 16 },
  stockAlertText: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  
  scrollContent: { padding: 20, paddingBottom: 100 },
  
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text },
  sectionSubtitle: { fontSize: 14, color: colors.primary, fontWeight: 'bold' },
  
  emptyCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text, marginTop: 15 },
  emptyText: { fontSize: 14, color: colors.textSecondary, marginTop: 5, textAlign: 'center' },
  emptyTextCenter: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 10 },
  
  // Timeline
  timeline: { paddingLeft: 10 },
  timelineRow: { flexDirection: 'row', marginBottom: 15 },
  timelineIndicator: { width: 30, alignItems: 'center' },
  timelineDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.border, borderWidth: 3, borderColor: colors.background, zIndex: 2, marginTop: 15 },
  dotSuccess: { backgroundColor: colors.success },
  dotDanger: { backgroundColor: colors.danger },
  dotPending: { backgroundColor: colors.primary },
  timelineLine: { width: 2, flex: 1, backgroundColor: colors.border, position: 'absolute', top: 30, bottom: -15, left: 14, zIndex: 1 },
  lineSuccess: { backgroundColor: colors.success }, // Linha colorida se o remédio anterior foi tomado
  
  doseCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 15, borderWidth: 1, borderColor: colors.border, marginLeft: 10 },
  doseCardDanger: { borderColor: '#FADBD8', backgroundColor: '#FEF9F8' },
  doseTimeContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 5 },
  doseTime: { fontSize: 16, fontWeight: 'bold', color: colors.primary },
  badgeSuccess: { backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeDanger: { backgroundColor: '#FDEBD0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: 'bold', color: colors.text },
  doseName: { fontSize: 17, fontWeight: 'bold', color: colors.text, marginBottom: 2 },
  doseDetails: { fontSize: 14, color: colors.textSecondary, marginBottom: 12 },
  
  takeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 20 },
  takeBtnPrimary: { backgroundColor: colors.primary },
  takeBtnDanger: { backgroundColor: colors.danger },
  takeBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  
  // History
  historyContainer: { backgroundColor: colors.surface, borderRadius: 16, padding: 15, borderWidth: 1, borderColor: colors.border },
  historyRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: colors.background, paddingBottom: 10 },
  historyIconBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  historyContent: { flex: 1 },
  historyName: { fontSize: 15, fontWeight: 'bold', color: colors.text },
  historyDate: { fontSize: 12, color: colors.textSecondary, marginTop: 2 }
});