package com.chaoscraft.wablaster.ui

import android.app.Application
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.chaoscraft.wablaster.campaign.CampaignManager
import com.chaoscraft.wablaster.db.daos.BroadcastListContactDao
import com.chaoscraft.wablaster.db.daos.BroadcastListDao
import com.chaoscraft.wablaster.db.daos.CampaignDao
import com.chaoscraft.wablaster.db.daos.ContactDao
import com.chaoscraft.wablaster.db.daos.CampaignResponseDao
import com.chaoscraft.wablaster.db.daos.BrokerDao
import com.chaoscraft.wablaster.db.daos.BrokerGroupDao
import com.chaoscraft.wablaster.db.daos.DealDao
import com.chaoscraft.wablaster.db.daos.ListingDao
import com.chaoscraft.wablaster.db.daos.SendLogDao
import com.chaoscraft.wablaster.db.entities.BrokerGroup
import com.chaoscraft.wablaster.db.entities.Campaign
import com.chaoscraft.wablaster.db.entities.CampaignStatus
import com.chaoscraft.wablaster.db.entities.CampaignResponse
import com.chaoscraft.wablaster.db.entities.Contact
import com.chaoscraft.wablaster.db.entities.Deal
import com.chaoscraft.wablaster.db.entities.Broker
import com.chaoscraft.wablaster.db.entities.Listing
import com.chaoscraft.wablaster.db.entities.SendLog
import com.chaoscraft.wablaster.engine.SkillsConfig
import com.chaoscraft.wablaster.media.MediaHelper
import com.chaoscraft.wablaster.service.BroadcastForegroundService
import com.chaoscraft.wablaster.util.SenderConfig
import com.chaoscraft.wablaster.util.UploadMediaRequest
import com.chaoscraft.wablaster.util.WaBroApiClient
import com.google.gson.Gson
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
@OptIn(ExperimentalCoroutinesApi::class)
class CampaignViewModel @Inject constructor(
    application: Application,
    private val campaignManager: CampaignManager,
    private val csvImporter: com.chaoscraft.wablaster.campaign.CsvImporter,
    private val campaignDao: CampaignDao,
    private val contactDao: ContactDao,
    private val brokerDao: BrokerDao,
    private val brokerGroupDao: BrokerGroupDao,
    private val listingDao: ListingDao,
    private val dealDao: DealDao,
    private val responseDao: CampaignResponseDao,
    private val sendLogDao: SendLogDao,
    private val mediaHelper: MediaHelper,
    private val waBroApiClient: WaBroApiClient,
    val senderConfig: SenderConfig,
    private val broadcastListDao: BroadcastListDao,
    private val broadcastListContactDao: BroadcastListContactDao
) : AndroidViewModel(application) {

    val stats = campaignManager.stats
    val recentLogs = campaignManager.recentLogs

    val campaignName = MutableStateFlow("")
    val messageTemplate = MutableStateFlow("")
    val mediaUri = MutableStateFlow<Uri?>(null)
    val skillsConfig = MutableStateFlow(SkillsConfig())
    val csvUri = MutableStateFlow<Uri?>(null)
    val importedContacts = MutableStateFlow<List<Contact>>(emptyList())
    val importErrors = MutableStateFlow<List<String>>(emptyList())
    val importTotalRows = MutableStateFlow(0)
    val activeCampaign = MutableStateFlow<Campaign?>(null)
    val savedCampaigns = MutableStateFlow<List<Campaign>>(emptyList())
    val runningCampaign = MutableStateFlow<Campaign?>(null)
    val selectedListingId = MutableStateFlow<Long?>(null)
    private val selectedDashboardCampaignId = MutableStateFlow<Long?>(null)

    // V2: Expose lists from DAOs
    val allGroups: Flow<List<BrokerGroup>> = brokerGroupDao.getAll()
    val listings: Flow<List<Listing>> = listingDao.getAllFlow()
    val brokers: Flow<List<Broker>> = brokerDao.getAll()
    val dashboardCampaign: StateFlow<Campaign?> = selectedDashboardCampaignId
        .flatMapLatest { campaignId ->
            if (campaignId == null || campaignId <= 0L) {
                flowOf(null)
            } else {
                campaignDao.getByIdFlow(campaignId)
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
    val dashboardLogs: StateFlow<List<SendLog>> = selectedDashboardCampaignId
        .flatMapLatest { campaignId ->
            if (campaignId == null || campaignId <= 0L) {
                flowOf(emptyList())
            } else {
                sendLogDao.getByCampaign(campaignId).map { logs -> logs.take(20) }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val dashboardTopResponses: StateFlow<List<CampaignResponse>> = selectedDashboardCampaignId
        .flatMapLatest { campaignId ->
            if (campaignId == null || campaignId <= 0L) {
                flowOf(emptyList())
            } else {
                responseDao.getResponsesWithBrokerInfo(campaignId).map { responses -> responses.take(5) }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val dashboardStats: StateFlow<com.chaoscraft.wablaster.campaign.CampaignStats> = selectedDashboardCampaignId
        .flatMapLatest { campaignId ->
            if (campaignId == null || campaignId <= 0L) {
                flowOf(com.chaoscraft.wablaster.campaign.CampaignStats())
            } else {
                combine(
                    combine(campaignDao.getByIdFlow(campaignId), contactDao.getCount(campaignId)) { campaign, total ->
                        campaign to total
                    },
                    combine(sendLogDao.getSentCount(campaignId), sendLogDao.getFailedCount(campaignId)) { sent, failed ->
                        sent to failed
                    },
                    combine(sendLogDao.getSkippedCount(campaignId), sendLogDao.getPausedCount(campaignId)) { skipped, paused ->
                        skipped to paused
                    }
                ) { campaignAndTotal, sentAndFailed, skippedAndPaused ->
                    val (campaign, total) = campaignAndTotal
                    val (sent, failed) = sentAndFailed
                    val (skipped, paused) = skippedAndPaused
                    com.chaoscraft.wablaster.campaign.CampaignStats(
                        campaignId = campaignId,
                        total = total,
                        sent = sent,
                        failed = failed,
                        skipped = skipped,
                        paused = paused,
                        isRunning = campaign?.status == CampaignStatus.RUNNING || campaign?.status == CampaignStatus.PAUSED,
                        isPaused = campaign?.status == CampaignStatus.PAUSED
                    )
                }.combine(stats) { dbStats, liveStats ->
                    if (liveStats.campaignId == campaignId) liveStats else dbStats
                }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), com.chaoscraft.wablaster.campaign.CampaignStats())
    val dashboardOutcomeStats: StateFlow<CampaignOutcomeStats> = selectedDashboardCampaignId
        .flatMapLatest { campaignId ->
            if (campaignId == null || campaignId <= 0L) {
                flowOf(CampaignOutcomeStats())
            } else {
                combine(
                    combine(
                        responseDao.getCountByCampaign(campaignId),
                        responseDao.getHotLeadCount(campaignId),
                        responseDao.getWarmLeadCount(campaignId),
                        responseDao.getColdLeadCount(campaignId)
                    ) { totalResponses, hotLeads, warmLeads, coldLeads ->
                        CampaignOutcomeStats(
                            totalResponses = totalResponses,
                            hotLeads = hotLeads,
                            warmLeads = warmLeads,
                            coldLeads = coldLeads
                        )
                    },
                    combine(
                        responseDao.getUnfollowedCount(campaignId),
                        dealDao.countByCampaign(campaignId),
                        dealDao.getTotalDealValue(campaignId),
                        responseDao.getAvgScore(campaignId)
                    ) { unfollowedLeads, dealCount, totalDealValue, averageLeadScore ->
                        CampaignOutcomeStats(
                            unfollowedLeads = unfollowedLeads,
                            dealCount = dealCount,
                            totalDealValue = totalDealValue ?: 0.0,
                            averageLeadScore = averageLeadScore ?: 0.0
                        )
                    }
                ) { responseMetrics, businessMetrics ->
                    CampaignOutcomeStats(
                        totalResponses = responseMetrics.totalResponses,
                        hotLeads = responseMetrics.hotLeads,
                        warmLeads = responseMetrics.warmLeads,
                        coldLeads = responseMetrics.coldLeads,
                        unfollowedLeads = businessMetrics.unfollowedLeads,
                        dealCount = businessMetrics.dealCount,
                        totalDealValue = businessMetrics.totalDealValue,
                        averageLeadScore = businessMetrics.averageLeadScore
                    )
                }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), CampaignOutcomeStats())

    private val gson = Gson()

    init {
        loadSavedCampaigns()
    }

    private fun loadSavedCampaigns() {
        viewModelScope.launch {
            campaignDao.getAllFlow().collect { campaigns ->
                savedCampaigns.value = campaigns
                val running = campaigns.find { it.status == CampaignStatus.RUNNING || it.status == CampaignStatus.PAUSED }
                runningCampaign.value = running
            }
        }
    }

    fun addContactsFromPhonebook(contacts: List<Contact>) {
        val existing = importedContacts.value.toMutableList()
        val existingPhones = existing.map { it.phone }.toSet()
        val newOnes = contacts.filter { it.phone !in existingPhones }
        importedContacts.value = existing + newOnes
        importTotalRows.value = importedContacts.value.size
    }

    fun setSelectedListing(listingId: Long?) {
        selectedListingId.value = listingId
    }

    fun selectDashboardCampaign(campaignId: Long) {
        selectedDashboardCampaignId.value = campaignId
    }

    fun setImportedContacts(contacts: List<Contact>) {
        importedContacts.value = contacts.distinctBy { it.phone }
        importTotalRows.value = importedContacts.value.size
    }

    fun addBrokersAsContacts(brokers: List<Broker>) {
        val contacts = brokers.map {
            Contact(
                phone = it.whatsappNumber.ifBlank { it.phone },
                name = it.name,
                locality = it.locality
            )
        }
        setImportedContacts(importedContacts.value + contacts)
    }

    fun importCsv(uri: Uri) {
        csvUri.value = uri
        viewModelScope.launch {
            try {
                val result = csvImporter.import(uri, 0)
                importedContacts.value = result.contacts
                importErrors.value = result.errors
                importTotalRows.value = result.totalRows
            } catch (e: Exception) {
                importErrors.value = listOf("CSV import failed: ${e.message}")
            }
        }
    }

    fun createAndStartCampaign() {
        viewModelScope.launch {
            try {
                val resolvedMediaUri = uploadMediaIfNeeded(mediaUri.value)
                val campaign = Campaign(
                    name = campaignName.value,
                    messageTemplate = messageTemplate.value,
                    mediaUri = resolvedMediaUri?.toString(),
                    skillsConfigJson = gson.toJson(skillsConfig.value)
                )
                val id = campaignDao.insert(campaign)
                val saved = campaign.copy(id = id)
                activeCampaign.value = saved
                selectedDashboardCampaignId.value = id

                val persistedContacts = importedContacts.value.map { it.copy(campaignId = id) }
                contactDao.insertAll(persistedContacts)

                startForegroundService()
                campaignManager.startCampaign(
                    campaignId = id,
                    contacts = persistedContacts,
                    messageTemplate = messageTemplate.value,
                    mediaUri = resolvedMediaUri,
                    skillsConfig = skillsConfig.value
                )
                selectedListingId.value?.let { campaignManager.associateListing(id, it) }
            } catch (e: Exception) {
                importErrors.value = listOf("Failed to start campaign: ${e.message}")
            }
        }
    }

    fun associateListing(listingId: Long) {
        activeCampaign.value?.let { campaign ->
            campaignManager.associateListing(campaign.id, listingId)
        }
    }

    private fun startForegroundService() {
        val context = getApplication<Application>()
        try {
            val intent = Intent(context, BroadcastForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } catch (e: Exception) {
            // Service start failed - log but don't crash
        }
    }

    fun resumeExistingCampaign(campaign: Campaign) {
        viewModelScope.launch {
            activeCampaign.value = campaign
            selectedDashboardCampaignId.value = campaign.id
            val config = try {
                gson.fromJson(campaign.skillsConfigJson, SkillsConfig::class.java)
            } catch (_: Exception) {
                SkillsConfig()
            }
            campaignManager.resumeCampaign(
                campaignId = campaign.id,
                messageTemplate = campaign.messageTemplate,
                mediaUri = campaign.mediaUri?.let { Uri.parse(it) },
                skillsConfig = config
            )
        }
    }

    private suspend fun uploadMediaIfNeeded(uri: Uri?): Uri? {
        if (uri == null) return null

        val value = uri.toString()
        if (value.startsWith("http://") || value.startsWith("https://")) {
            return uri
        }

        val mimeType = mediaHelper.getMimeType(uri)
        val fileName = mediaHelper.getDisplayName(uri)
        val bytes = mediaHelper.readBytes(uri)
        val result = waBroApiClient.uploadMedia(
            UploadMediaRequest(
                fileName = fileName,
                mimeType = mimeType,
                bytes = bytes
            )
        )

        return result.fold(
            onSuccess = { Uri.parse(it.mediaUrl) },
            onFailure = { throw IllegalStateException("Media upload failed: ${it.message}", it) }
        )
    }

    fun pauseCampaign() = campaignManager.pauseCampaign()
    fun resumeCampaign() = campaignManager.resumeFromPause()

    fun resumeSelectedCampaign() {
        val selected = dashboardCampaign.value ?: return
        resumeExistingCampaign(selected)
    }

    fun markDashboardFollowUpSent(responseId: Long) {
        viewModelScope.launch {
            try {
                responseDao.markFollowUpSent(responseId, System.currentTimeMillis())
            } catch (_: Exception) {
            }
        }
    }

    fun markDashboardDealClosed(response: CampaignResponse, dealValue: Double) {
        if (dealValue <= 0.0) return
        viewModelScope.launch {
            try {
                responseDao.markDealClosed(response.id, dealValue)
                dealDao.insert(
                    Deal(
                        campaignId = response.campaignId,
                        listingId = response.listingId,
                        brokerId = response.brokerId,
                        clientName = response.brokerName.ifBlank { "Broker Lead" },
                        clientPhone = response.brokerPhone,
                        dealValue = dealValue,
                        commissionAmount = response.commissionAmount,
                        commissionStatus = response.commissionStatus,
                        stage = "CLOSED_WON"
                    )
                )
            } catch (_: Exception) {
            }
        }
    }

    fun stopCampaign() {
        campaignManager.stopCampaign()
        val context = getApplication<Application>()
        try {
            context.stopService(Intent(context, BroadcastForegroundService::class.java))
        } catch (_: Exception) { }
    }
}
