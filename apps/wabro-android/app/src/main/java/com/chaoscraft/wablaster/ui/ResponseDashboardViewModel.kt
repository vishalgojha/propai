package com.chaoscraft.wablaster.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.chaoscraft.wablaster.db.daos.CampaignResponseDao
import com.chaoscraft.wablaster.db.daos.DealDao
import com.chaoscraft.wablaster.db.daos.ListingDao
import com.chaoscraft.wablaster.db.entities.CampaignResponse
import com.chaoscraft.wablaster.db.entities.Deal
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
@OptIn(ExperimentalCoroutinesApi::class)
class ResponseDashboardViewModel @Inject constructor(
    application: Application,
    private val responseDao: CampaignResponseDao,
    private val dealDao: DealDao,
    private val listingDao: ListingDao
) : AndroidViewModel(application) {

    private val _selectedCampaignId = MutableStateFlow<Long?>(null)
    val selectedCampaignId: StateFlow<Long?> = _selectedCampaignId.asStateFlow()

    fun selectCampaign(campaignId: Long) {
        _selectedCampaignId.value = campaignId
    }

    val hotLeads: Flow<List<CampaignResponse>> = _selectedCampaignId.flatMapLatest { campaignId ->
        if (campaignId != null && campaignId > 0) responseDao.getHotLeads(campaignId)
        else flowOf(emptyList())
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val warmLeads: Flow<List<CampaignResponse>> = _selectedCampaignId.flatMapLatest { campaignId ->
        if (campaignId != null && campaignId > 0) responseDao.getByCampaignAndIntent(campaignId, "WARM")
        else flowOf(emptyList())
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val coldLeads: Flow<List<CampaignResponse>> = _selectedCampaignId.flatMapLatest { campaignId ->
        if (campaignId != null && campaignId > 0) responseDao.getByCampaignAndIntent(campaignId, "COLD")
        else flowOf(emptyList())
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val allLeads: Flow<List<CampaignResponse>> = _selectedCampaignId.flatMapLatest { campaignId ->
        if (campaignId != null && campaignId > 0) responseDao.getResponsesWithBrokerInfo(campaignId)
        else flowOf(emptyList())
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val hotLeadCount: Flow<Int> = _selectedCampaignId.flatMapLatest { campaignId ->
        if (campaignId != null && campaignId > 0) responseDao.getHotLeadCount(campaignId)
        else flowOf(0)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val warmLeadCount: Flow<Int> = _selectedCampaignId.flatMapLatest { campaignId ->
        if (campaignId != null && campaignId > 0) responseDao.getWarmLeadCount(campaignId)
        else flowOf(0)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val coldLeadCount: Flow<Int> = _selectedCampaignId.flatMapLatest { campaignId ->
        if (campaignId != null && campaignId > 0) responseDao.getColdLeadCount(campaignId)
        else flowOf(0)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val unfollowedCount: Flow<Int> = _selectedCampaignId.flatMapLatest { campaignId ->
        if (campaignId != null && campaignId > 0) responseDao.getUnfollowedCount(campaignId)
        else flowOf(0)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val totalResponses: Flow<Int> = _selectedCampaignId.flatMapLatest { campaignId ->
        if (campaignId != null && campaignId > 0) responseDao.getCountByCampaign(campaignId)
        else flowOf(0)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val unclosedHotLeads: Flow<List<CampaignResponse>> = _selectedCampaignId.flatMapLatest { campaignId ->
        if (campaignId != null && campaignId > 0) responseDao.getUnclosedHotLeads(campaignId)
        else flowOf(emptyList())
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val deals: Flow<List<Deal>> = _selectedCampaignId.flatMapLatest { campaignId ->
        if (campaignId != null && campaignId > 0) dealDao.getByCampaign(campaignId)
        else flowOf(emptyList())
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Actions
    fun markFollowUpSent(responseId: Long) {
        viewModelScope.launch {
            try {
                responseDao.markFollowUpSent(responseId, System.currentTimeMillis())
            } catch (e: Exception) {
                // Log error
            }
        }
    }

    fun markDealClosed(responseId: Long, dealValue: Double) {
        viewModelScope.launch {
            try {
                responseDao.markDealClosed(responseId, dealValue)
            } catch (e: Exception) {
                // Log error
            }
        }
    }

    fun updateCommissionStatus(responseId: Long, status: String) {
        viewModelScope.launch {
            try {
                responseDao.updateCommissionStatus(responseId, status)
            } catch (e: Exception) {
                // Log error
            }
        }
    }

    fun recordDealFromLead(
        campaignId: Long,
        listingId: Long,
        brokerId: Long,
        clientName: String,
        clientPhone: String,
        dealValue: Double,
        commissionRate: Double,
        commissionAmount: Double,
        stage: String = "INQUIRY"
    ) {
        viewModelScope.launch {
            try {
                dealDao.insert(Deal(
                    campaignId = campaignId,
                    listingId = listingId,
                    brokerId = brokerId,
                    clientName = clientName,
                    clientPhone = clientPhone,
                    dealValue = dealValue,
                    commissionRate = commissionRate,
                    commissionAmount = commissionAmount,
                    stage = stage
                ))
            } catch (e: Exception) {
                // Log error
            }
        }
    }
}
