package com.chaoscraft.wablaster.db

import android.content.Context
import com.chaoscraft.wablaster.db.daos.BrokerDao
import com.chaoscraft.wablaster.db.daos.BrokerGroupCrossRefDao
import com.chaoscraft.wablaster.db.daos.BrokerGroupDao
import com.chaoscraft.wablaster.db.entities.Broker
import com.chaoscraft.wablaster.db.entities.BrokerGroup
import com.chaoscraft.wablaster.db.entities.BrokerGroupCrossRef
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BrokerRepository @Inject constructor(
    private val brokerDao: BrokerDao,
    private val groupDao: BrokerGroupDao,
    private val crossRefDao: BrokerGroupCrossRefDao,
    @ApplicationContext private val context: Context
) {
    val allBrokers = brokerDao.getAll()
    val activeBrokers = brokerDao.getAllActive()
    val allGroups = groupDao.getAll()

    suspend fun getById(id: Long): Broker? = brokerDao.getById(id)

    suspend fun getByPhone(phone: String): Broker? = brokerDao.getByPhone(phone)

    fun searchByCityAndSpecialty(city: String?, specialty: String?) =
        brokerDao.searchByCityAndSpecialty(city, specialty)

    fun getByCity(city: String) = brokerDao.getByCity(city)

    fun getByLocality(locality: String) = brokerDao.getByLocality(locality)

    fun getByPincode(pincode: String) = brokerDao.getByPincode(pincode)

    fun getBySpecialization(specialty: String) = brokerDao.getBySpecialization(specialty)

    fun getByTag(tag: String) = brokerDao.getByTag(tag)

    suspend fun insertOrUpdate(broker: Broker): Long {
        val existing = getByPhone(broker.phone)
        return if (existing != null) {
            brokerDao.update(broker.copy(id = existing.id))
            existing.id
        } else {
            brokerDao.insert(broker)
        }
    }

    suspend fun insertAll(brokers: List<Broker>) {
        brokers.forEach { insertOrUpdate(it) }
    }

    suspend fun delete(broker: Broker) {
        brokerDao.delete(broker)
    }

    suspend fun deactivate(id: Long) = brokerDao.deactivate(id)

    suspend fun activate(id: Long) = brokerDao.activate(id)

    suspend fun updateScore(brokerId: Long, score: Double) = brokerDao.updateScore(brokerId, score)

    fun searchGroups(query: String) = groupDao.search(query)

    suspend fun createGroup(name: String, type: String = "CUSTOM", criteria: String = "{}"): Long {
        return groupDao.insert(BrokerGroup(name = name, type = type, filterCriteria = criteria))
    }

    suspend fun deleteGroup(groupId: Long) {
        crossRefDao.deleteByGroup(groupId)
        groupDao.deleteById(groupId)
    }

    suspend fun addBrokersToGroup(brokerIds: List<Long>, groupId: Long) {
        val refs = brokerIds.map { BrokerGroupCrossRef(brokerId = it, groupId = groupId) }
        crossRefDao.insertAll(refs)
        groupDao.updateBrokerCount(groupId)
    }

    suspend fun removeBrokerFromGroup(brokerId: Long, groupId: Long) {
        crossRefDao.removeBrokerFromGroup(brokerId, groupId)
        groupDao.updateBrokerCount(groupId)
    }

    fun getBrokersInGroup(groupId: Long) = crossRefDao.getBrokersInGroup(groupId)

    suspend fun geoTagBroker(brokerId: Long, pincode: String): Boolean {
        val broker = getById(brokerId) ?: return false
        insertOrUpdate(broker.copy(pincode = pincode))
        return true
    }

    suspend fun count(): Int = brokerDao.count()
}
